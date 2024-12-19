import {Hono} from "hono";

const app = new Hono()

app.post('/', async (c) => c.json({message: 'Event not supported'}))

export default app;