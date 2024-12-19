import {Hono} from "hono";
import {getAuth} from "@hono/clerk-auth";
import can from "@/middlewares/can";
import {getPrisma} from "@/lib/prisma";
import {zValidator} from "@hono/zod-validator";
import {z} from "zod";

const app = new Hono()

app.get('/', async (c) => {
  const clerk = c.get('clerk')
  const clerkAuth = getAuth(c)
  if(!clerkAuth?.userId) {
    return c.json({error: 'Por favor inicia sesión'}, 401)
  }
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
    const clerkAuth = getAuth(c)
    if(!clerkAuth?.userId) {
      return c.json({error: 'Por favor inicia sesión'}, 401)
    }

    const clerk = c.get('clerk')
    const prisma = getPrisma(c)

    // @ts-ignore
    const body: { name: string; description: string; email: string } = c.req.valid('json')

    const clientsFound = await clerk.users.getUserList({
      emailAddress: [body.email]
    })

    if(clientsFound.totalCount == 0) {
      return c.json({error: 'No se encontró el cliente'}, 404)
    }

    const client = clientsFound.data[0]

    const quote = await prisma.quote.create({
      data: {
        creatorId: clerkAuth.userId,
        clientId: client.id,
        name: body.name,
        description: body.description,
      },
      include: {
        Item: true,
      },
    })

    return c.json({quote}, 201)
  });

app.get('/:id', async (c) => {
  const clerkAuth = getAuth(c)
  if(!clerkAuth?.userId) {
    return c.json({error: 'Por favor inicia sesión'}, 401)
  }

  const { id } = c.req.param()
  if(!id || isNaN(parseInt(id))) {
    return c.json({error: 'El id es requerido'}, 400)
  }
  const quoteId = parseInt(id)
  const prisma = getPrisma(c)

  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        {
          id: quoteId,
          clientId: clerkAuth.userId,
        },
        {
          id: quoteId,
          creatorId: clerkAuth.userId
        }
      ]
    },
    include: {
      Item: true,
    }
  })

  if(quote == null) {
    return c.json({quote: null, itemsSum: null}, 404);
  }

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
  })
})

app.use('/:id', can('quotes.update'))
  .use('/:id', zValidator('json', z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().min(1).max(255).optional(),
  })))
  .patch('/:id', async (c) => {
    const clerkAuth = getAuth(c)
    if(!clerkAuth?.userId) {
      return c.json({error: 'Por favor inicia sesión'}, 401)
    }

    const { id } = c.req.param()
    if(!id || isNaN(parseInt(id))) {
      return c.json({error: 'El id es requerido'}, 400)
    }
    const quoteId = parseInt(id)
    const prisma = getPrisma(c)

    // @ts-ignore
    const body = c.req.valid('json')

    const updatedQuote = await prisma.quote.update({
      where: {
        id: quoteId,
        creatorId: clerkAuth.userId
      },
      data: body,
      include: {
        Item: true,
      },
    })

    return c.json({quote: updatedQuote}, updatedQuote == null ? 404 : 200)
  });

app.use('/:id', can('quotes.destroy'))
  .delete('/:id', async (c) => {
    const clerkAuth = getAuth(c)
    if(!clerkAuth?.userId) {
      return c.json({error: 'Por favor inicia sesión'}, 401)
    }

    const { id } = c.req.param()
    if(!id || isNaN(parseInt(id))) {
      return c.json({error: 'El id es requerido'}, 400)
    }
    const quoteId = parseInt(id)
    const prisma = getPrisma(c)

    const items = await prisma.item.findMany({
      where: {
        quoteId,
      }
    });

    if(items.length > 0) {
      return c.json({error: 'No se puede eliminar una cotización con elementos!'}, 400)
    }

    const deletedQuote = await prisma.quote.delete({
      where: {
        id: quoteId,
        creatorId: clerkAuth.userId
      },
      include: {
        Item: true,
      }
    })

    return c.json({quote: deletedQuote}, deletedQuote == null ? 404 : 200)
  });

export default app