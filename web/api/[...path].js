import { dispatch } from "../lib/router.mjs";

async function requestBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body);
  if (request.body !== undefined && request.body !== null) {
    return Buffer.from(JSON.stringify(request.body));
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  const path = Array.isArray(request.query?.path)
    ? request.query.path.join("/")
    : request.query?.path;
  // Vercel's zero-config route for `[...path].js` only matches one segment
  // (`^/api/([^/]+)$`), so vercel.json adds an explicit `/api/:path*` rewrite. Depending
  // on which route wins, request.url arrives either as the original `/api/fleet/summary`
  // or as the rewritten `/api/[...path]?path=fleet/summary`. Rebuild from `path` whenever
  // the url still carries the placeholder, and keep any real query string.
  const rawQuery = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  const usable = request.url.startsWith("/api/") && !request.url.includes("[...path]");
  const carried = new URLSearchParams(rawQuery.slice(1));
  carried.delete("path");
  carried.delete("...path");
  const rebuiltQuery = carried.toString();
  const originalUrl = usable
    ? request.url
    : `/api/${path ?? ""}${rebuiltQuery ? `?${rebuiltQuery}` : ""}`;
  const result = await dispatch({
    method: request.method,
    url: originalUrl,
    headers: request.headers,
    body: await requestBody(request)
  });
  response.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  response.end(result.body);
}
