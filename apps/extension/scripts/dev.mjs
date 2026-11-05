import { watch } from "node:fs";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtension } from "./build.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(root, "../../.env"), quiet: true });
let building = false;
let queued = false;
let timer;
async function rebuild() {
  if (building) { queued = true; return; }
  building = true;
  try {
    for (const browser of ["chrome", "firefox"]) {
      const result = await buildExtension({ browser, apiUrl: process.env.API_PUBLIC_URL, webUrl: process.env.WEB_URL });
      console.log(`Built ${browser} for ${result.apiUrl}: ${result.target}`);
    }
    console.log("Reload the extension in your browser, then refresh YouTube to use these files.");
  } catch (error) { console.error(`Extension build failed: ${error.message}`); }
  finally {
    building = false;
    if (queued) { queued = false; await rebuild(); }
  }
}
await rebuild();
watch(root, { recursive: true }, (_event, filename) => {
  if (!filename || /^(?:dist|node_modules|test)[/\\]/.test(filename)) return;
  if (!/\.(?:js|mjs|css|html|json|svg|png)$/.test(filename)) return;
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});
console.log("Watching extension files for changes.");
