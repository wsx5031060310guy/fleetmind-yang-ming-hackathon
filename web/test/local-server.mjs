import { createApiServer } from "../lib/node-server.mjs";

const port = Number(process.env.PORT ?? 3000);
createApiServer().listen(port, "127.0.0.1", () => {
  console.log(`FleetMind Node API listening on http://127.0.0.1:${port}`);
});
