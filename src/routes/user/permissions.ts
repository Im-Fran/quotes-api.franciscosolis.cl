import {Hono} from "hono";
import {getAuth} from "@hono/clerk-auth";
import {HTTPException} from "hono/http-exception";
import {getPrisma} from "@/lib/prisma";

const app = new Hono();

app.get("/", async (c) => {
  const clerkAuth = getAuth(c)
  if(!clerkAuth?.userId) throw new HTTPException(401, { message: 'Not authenticated' })
  const clerkClient = c.get('clerk')
  const user = await clerkClient.users.getUser(clerkAuth.userId)

  const prisma= getPrisma(c)
  const permissions = await prisma.assignedPermissions.findMany({
    where: {
      userId: user.id
    }
  })

  return c.json({ permissions })
});

export default app