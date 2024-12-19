import {Hono} from "hono";
import {getAuth} from "@hono/clerk-auth";
import {HTTPException} from "hono/http-exception";

const app = new Hono()

app.get('/', async (c) => {
  const authUser = getAuth(c)
  if(!authUser?.userId) throw new HTTPException(401, { message: 'Not authenticated' })
  const clerkClient = c.get('clerk')
  const user = await clerkClient.users.getUser(authUser.userId)
  const email = user.primaryEmailAddressId ? await clerkClient.emailAddresses.getEmailAddress(user.primaryEmailAddressId) : null

  return c.json({
    id: user.id,
    imageUrl: user.imageUrl,
    email: email && {
      id: email?.id,
      address: email?.emailAddress,
      verified: email?.verification?.status === 'verified',
    },
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastSignInAt,
  })
})

export default app