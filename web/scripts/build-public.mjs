import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const source = path.join(repoRoot, "apps", "api", "src", "main", "resources", "static");
const destination = path.join(webRoot, "public");

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, force: true });
console.log(`Copied static site to ${path.relative(process.cwd(), destination) || "public"}`);
