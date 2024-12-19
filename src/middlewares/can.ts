import {createMiddleware} from "hono/factory";
import {getAuth} from "@hono/clerk-auth";

const can = (permission: string) => createMiddleware(async (c, next) => {
  const clerkAuth = getAuth(c)
  if(!clerkAuth?.userId) {
    return c.json({
      error: 'Por favor inicia sesión'
    }, 401)
  }

  const prisma = c.get('prisma')
  const assignedPermission = await prisma.assignedPermissions.findFirst({
    where: {
      userId: clerkAuth.userId,
      permission,
    }
  })

  if(assignedPermission == null) {
    return c.json({
      error: 'No tienes permisos para realizar esta acción'
    }, 403);
  }

  return await next()
})

export default can