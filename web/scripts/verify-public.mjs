// Runs as Vercel's buildCommand. public/ is produced locally by build-public.mjs and
// uploaded with the deployment, because its source (apps/api/src/main/resources/static)
// is outside this deploy root and unreachable from Vercel's builder. Fail loudly rather
// than shipping an empty or half-copied site.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(webRoot, "public");
const REQUIRED = [
  "index.html", "dashboard.html", "map.html", "voyage.html",
  "admin.html", "proposal.html", "architecture.html", "deck.html",
  "app.js", "map.js", "voyage.js", "admin.js", "styles.css"
];

let entries;
try {
  entries = new Set(await readdir(publicDir));
} catch {
  console.error(`public/ is missing. Run \`npm run build\` before deploying.`);
  process.exit(1);
}

const missing = REQUIRED.filter((file) => !entries.has(file));
if (missing.length > 0) {
  console.error(`public/ is incomplete, missing: ${missing.join(", ")}`);
  console.error("Run `npm run build` (copies apps/api/src/main/resources/static) and redeploy.");
  process.exit(1);
}

for (const file of REQUIRED) {
  const { size } = await stat(path.join(publicDir, file));
  if (size === 0) {
    console.error(`public/${file} is empty — the copy did not complete.`);
    process.exit(1);
  }
}

console.log(`public/ verified: ${entries.size} top-level entries, all ${REQUIRED.length} required files present`);
