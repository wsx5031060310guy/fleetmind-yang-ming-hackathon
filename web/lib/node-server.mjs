import { createServer } from "node:http";
import { dispatch } from "./router.mjs";

const MAX_REQUEST_BYTES = 11 * 1024 * 1024;

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("request body exceeds 11MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApiServer() {
  return createServer(async (request, response) => {
    try {
      const result = await dispatch({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await readBody(request)
      });
      response.statusCode = result.status;
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      response.end(result.body);
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: "internal_error", message: error.message }));
    }
  });
}
