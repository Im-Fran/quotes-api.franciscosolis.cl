import { Hono } from 'hono'
import {clerkMiddleware} from "@hono/clerk-auth";
import prismaClients from "@/lib/prisma";
import {PrismaClient} from '@prisma/client'

/* Routes */
import quotes from '@/routes/quotes'
import quoteItems from "@/routes/quotes/items";
import clerkWebhook from '@/routes/webhooks/clerk'
import user from '@/routes/user'
import permissions from "@/routes/user/permissions";
import {cors} from "hono/cors";

declare module 'hono' {
  interface ContextVariableMap {
    prisma: PrismaClient
  }
}

type Bindings = {
  FRONTEND_URL: String
  JWT_SECRET: string
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings}>()

app.use('*', cors({
  origin: (origin, c) => {
    const { FRONTEND_URL } = c.env
    if (origin === FRONTEND_URL) {
      return origin
    }
    return ''
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}))
app.use('*', clerkMiddleware())
app.use('*', async (c, next) => {
  const prisma = await prismaClients.fetch(c.env.DB)
  c.set('prisma', prisma)
  return await next()
});

/* Webhooks */
app.route('/webhooks/clerk', clerkWebhook)

/* App Routes */
app.route('/user', user)
app.route('/user/permissions', permissions)

app.route('/quotes', quotes)
app.route('/quotes', quoteItems)


export default app