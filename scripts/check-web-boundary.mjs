import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const forbidden = /@yt-equity\/db|drizzle-orm|@neondatabase\/serverless|\b(DATABASE_URL|SQL)\b/;
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
const violations = [];
for (const file of await walk("apps/web")) if (forbidden.test(await readFile(file, "utf8"))) violations.push(file);
if (violations.length) { console.error(`Web/API boundary violation:\n${violations.join("\n")}`); process.exit(1); }
console.log("Web/API boundary check passed.");
