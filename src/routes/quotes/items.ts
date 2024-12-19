import {Context, Hono} from "hono";
import {HTTPException} from "hono/http-exception";
import {getAuth} from "@hono/clerk-auth";
import can from "@/middlewares/can";
import {getPrisma} from "@/lib/prisma";
import {zValidator} from "@hono/zod-validator";
import {z} from "zod";

const app = new Hono()

app.get('/:id/items', async (c) => {
  const { prisma, quote } = await validateAuthAndGetQuote(c)

  const items = await prisma.item.findMany({
    where: {
      quoteId: quote.id
    }
  })

  return c.json({items})
});

app.use('/:id/items', can('items.create'))
  .use('/:id/items', zValidator('json', z.object({
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(255),
    amount: z.number().min(0).max(9999999999),
  })))
  .post('/:id/items', async (c) => {
    const { prisma, quote } = await validateAuthAndGetQuote(c)

    // @ts-ignore
    const body = c.req.valid('json')
    const item = await prisma.item.create({
      data: {
        quoteId: quote.id,
        // @ts-ignore
        ...body
      }
    })

    return c.json({item}, 201)
  });

app.use('/:id/items/:itemId', can('items.update'))
  .use('/:id/items/:itemId', zValidator('json', z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().min(1).max(255).optional(),
    amount: z.number().min(0).max(9999999999).optional(),
  })))
  .patch('/:id/items/:itemId', async (c) => {
    const { prisma, quote } = await validateAuthAndGetQuote(c)

    const { itemId } = c.req.param()
    if(!itemId) throw new HTTPException(400, { message: 'Item id is required' })

    const numericItemId = parseInt(itemId)
    if(isNaN(numericItemId)) throw new HTTPException(400, { message: 'Item id must be a number' })

    const body = await c.req.json()
    const item = await prisma.item.update({
      where: {
        id: numericItemId,
        quoteId: quote.id
      },
      data: body
    })

    return c.json({item})
  });

app.delete('/:id/items/:itemId', can('items.destroy'), async (c) => {
  const { prisma, quote } = await validateAuthAndGetQuote(c)

  const { itemId } = c.req.param()
  if(!itemId) throw new HTTPException(400, { message: 'Item id is required' })

  const numericItemId = parseInt(itemId)
  if(isNaN(numericItemId)) throw new HTTPException(400, { message: 'Item id must be a number' })

  const findItem = await prisma.item.findFirst({
    where: {
      id: numericItemId,
      quoteId: quote.id
    }
  });

  if(!findItem) throw new HTTPException(404, { message: 'Item not found' })

  await prisma.item.delete({
    where: {
      id: numericItemId,
      quoteId: quote.id
    }
  })

  return c.json(undefined, 204)
});

const validateAuthAndGetQuote = async (c: Context) => {
  const clerkAuth = getAuth(c)
  if(!clerkAuth?.userId) throw new HTTPException(401, { message: 'Not authenticated' })

  const { id } = c.req.param()
  if(!id) throw new HTTPException(400, { message: 'Id is required' })

  const numericId = parseInt(id)
  if(isNaN(numericId)) throw new HTTPException(400, { message: 'Id must be a number' })

  const prisma = getPrisma(c)
  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        {
          id: numericId,
          creatorId: clerkAuth.userId
        },
        {
          id: numericId,
          clientId: clerkAuth.userId
        }
      ]
    },
  });

  if(!quote) throw new HTTPException(404, { message: 'Quote not found' })

  return {
    clerkAuth,
    prisma,
    quote,
  }
};

export default app
