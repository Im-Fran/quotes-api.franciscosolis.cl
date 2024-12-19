import {createMiddleware} from "hono/factory";
import {getAuth} from "@hono/clerk-auth";
import {HTTPException} from "hono/http-exception";

const can = (permission: string) => createMiddleware(async (c, next) => {
  const authUser = getAuth(c)
  if(authUser?.userId == null) throw new HTTPException(401, { message: 'Not authenticated' })

  const prisma = c.get('prisma')
  const assignedPermission = await prisma.assignedPermissions.findFirst({
    where: {
      userId: authUser.userId,
      permission,
    }
  })

  if(assignedPermission == null) throw new HTTPException(403, { message: 'Not authorized' })

  return await next()
})

export default can