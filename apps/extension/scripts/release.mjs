import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildExtension } from "./build.mjs";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releases = join(root, "dist", "releases");
const artifacts = [];
for (const browser of ["chrome", "firefox"]) {
  const build = await buildExtension({ browser, release: true, apiUrl: process.env.API_PUBLIC_URL, webUrl: process.env.WEB_URL });
  await mkdir(releases, { recursive: true });
  const filename = `yt-equity-${browser}-${build.version}.zip`;
  const path = join(releases, filename);
  await rm(path, { force: true });
  const files = (await readdir(build.target)).sort();
  await run("zip", ["-q", "-X", "-r", path, ...files], { cwd: build.target });
  const { stdout } = await run("unzip", ["-Z1", path]);
  const entries = stdout.trim().split("\n");
  if (!entries.includes("manifest.json") || entries.some(file => /(?:^|\/)(?:\.env|node_modules|test|\.DS_Store)(?:\/|$)/.test(file))) {
    throw new Error(`Invalid release archive: ${filename}`);
  }
  const sha256 = createHash("sha256").update(await readFile(path)).digest("hex");
  artifacts.push({ filename, sha256, version: build.version, browser, apiUrl: build.apiUrl, webUrl: build.webUrl });
  console.log(`Packaged ${path}`);
}
await writeFile(join(releases, "release.json"), `${JSON.stringify(artifacts, null, 2)}\n`);
await writeFile(join(releases, "SHA256SUMS"), artifacts.map(({ sha256, filename }) => `${sha256}  ${filename}\n`).join(""));
