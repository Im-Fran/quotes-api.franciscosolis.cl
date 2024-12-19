import {PrismaClient} from '@prisma/client'
import {PrismaD1} from '@prisma/adapter-d1'
import {Context} from "hono";

const prismaClients = {
  async fetch(db: D1Database) {
    const adapter = new PrismaD1(db)
    return new PrismaClient({adapter})
  },
}

export default prismaClients

export const getPrisma = (c: Context) => c.get('prisma') as PrismaClient