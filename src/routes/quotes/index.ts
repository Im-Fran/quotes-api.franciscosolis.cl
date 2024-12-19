import {Context, Hono} from "hono";
import {getAuth} from "@hono/clerk-auth";
import can from "@/middlewares/can";
import {HTTPException} from "hono/http-exception";
import {getPrisma} from "@/lib/prisma";
import {zValidator} from "@hono/zod-validator";
import {z} from "zod";

const app = new Hono()

app.get('/', async (c) => {
  const clerk = c.get('clerk')
  const clerkAuth = validateAuth(c)
  const prisma = getPrisma(c)
  const skip = parseInt(c.req.query('skip') || '0') || 0
  const take = parseInt(c.req.query('take') || '10') || 10

  const quotes = await prisma.quote.findMany({
    where: {
      OR: [
        {
          creatorId: clerkAuth.userId
        },
        {
          clientId: clerkAuth.userId
        }
      ]
    },
    orderBy: {
      createdAt: 'desc'
    },
    take,
    skip,
  });

  const totalQuotes = await prisma.quote.count({
    where: {
      OR: [
        {
          creatorId: clerkAuth.userId
        },
        {
          clientId: clerkAuth.userId
        }
      ]
    },
    orderBy: {createdAt: 'desc'}
  });

  const data = [];
  for(const quote of quotes) {
    const creator = (await clerk.users.getUser(quote.creatorId))
    const client = (await clerk.users.getUser(quote.clientId))
    data.push({
      ...quote,
      creator: {
        name: creator.fullName,
        avatar: creator.imageUrl
      },
      client: {
        name: client.fullName,
        avatar: client.imageUrl
      }
    })
  }

  return c.json({
    quotes: data,
    hasMore: totalQuotes > skip + take
  })
});

app.use('/', can('quotes.create'))
  .use('/', zValidator('json', z.object({
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(255),
    email: z.string().min(1).email(),
  })))
  .post('/', async (c) => {
    const clerkAuth = validateAuth(c)
    const clerk = c.get('clerk')
    const prisma = getPrisma(c)

    // @ts-ignore
    const body: { name: string; description: string; email: string } = c.req.valid('json')

    const clientsFound = await clerk.users.getUserList({
      emailAddress: [body.email]
    })

    if(clientsFound.totalCount == 0) {
      throw new HTTPException(404, { message: 'Client not found' })
    }

    const client = clientsFound.data[0]

    const quote = await prisma.quote.create({
      data: {
        creatorId: clerkAuth.userId,
        clientId: client.id,
        name: body.name,
        description: body.description,
      }
    })

    return c.json({quote}, 201)
  });

app.get('/:id', async (c) => {
  const { clerkAuth, id } = await validateAuthAndGetQuoteId(c)
  const prisma = getPrisma(c)

  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        {
          id,
          clientId: clerkAuth.userId,
        },
        {
          id,
          creatorId: clerkAuth.userId
        }
      ]
    },
  })

  if(quote == null) {
    return c.json({quote: null, itemsSum: null}, 404);
  }

  const itemsSum = await prisma.item.aggregate({
    where: {
      quoteId: id
    },
    _sum: {
      amount: true
    }
  });

  const clerk = c.get('clerk')
  const creator = (await clerk.users.getUser(quote.creatorId))
  const client = (await clerk.users.getUser(quote.clientId))

  return c.json({
    quote: {
      ...quote,
      creator: {
        name: creator.fullName,
        avatar: creator.imageUrl
      },
      client: {
        name: client.fullName,
        avatar: client.imageUrl
      }
    },
    itemsSum,
  })
})

app.use('/:id', can('quotes.update'))
  .use('/:id', zValidator('json', z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().min(1).max(255).optional(),
  })))
  .patch('/:id', async (c) => {
    const { clerkAuth, id } = await validateAuthAndGetQuoteId(c)
    const prisma = getPrisma(c)

    // @ts-ignore
    const body = c.req.valid('json')

    const updatedQuote = await prisma.quote.update({
      where: {
        id,
        creatorId: clerkAuth.userId
      },
      data: body
    })

    return c.json({quote: updatedQuote}, updatedQuote == null ? 404 : 200)
  });

app.use('/:id', can('quotes.destroy'))
  .delete('/:id', async (c) => {
    const { clerkAuth, id } = await validateAuthAndGetQuoteId(c)
    const prisma = getPrisma(c)

    const deletedQuote = await prisma.quote.delete({
      where: {
        id,
        creatorId: clerkAuth.userId
      }
    })

    return c.json({quote: deletedQuote}, deletedQuote == null ? 404 : 200)
  });

const validateAuth = (c: Context) => {
  const clerkAuth = getAuth(c)
  if(!clerkAuth?.userId) throw new HTTPException(401, { message: 'Not authenticated' })

  return clerkAuth
}

const validateAuthAndGetQuoteId = async (c: Context) => {
  const clerkAuth = validateAuth(c)

  const { id } = c.req.param()
  if(!id) throw new HTTPException(400, { message: 'Id is required' })

  const numericId = parseInt(id)
  if(isNaN(numericId)) throw new HTTPException(400, { message: 'Id must be a number' })

  return {
    clerkAuth,
    id: numericId,
  }
}

export default app