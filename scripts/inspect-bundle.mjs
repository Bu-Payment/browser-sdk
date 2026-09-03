import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const bundle = readFileSync(resolve(projectRoot, "dist/index.js"), "utf8");
const forbidden = [
  /from\s+["']node:/,
  /require\s*\(/,
  /createHmac/,
  /process\.env/,
  /\bBuffer\b/,
  /private[_-]?key/i,
  /client[_-]?secret/i,
];
for (const pattern of forbidden) {
  if (pattern.test(bundle)) throw new Error(`Browser bundle contains forbidden pattern ${pattern}`);
}
const metadata = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
if (metadata.dependencies && Object.keys(metadata.dependencies).length > 0) {
  throw new Error("Browser SDK must not have runtime dependencies");
}
