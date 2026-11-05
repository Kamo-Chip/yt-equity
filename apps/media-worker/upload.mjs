import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";

const [kind, id, inputFile, ...extra] = process.argv.slice(2);
const validId = kind === "channel"
  ? /^UC[\w-]{22}$/.test(id ?? "")
  : kind === "firm" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id ?? "");
if (extra.length || !inputFile || !validId) {
  throw new Error("Usage: node upload.mjs <channel|firm> <YouTube-ID|firm-UUID> <image-file>");
}
const origin = process.env.MEDIA_PUBLIC_ORIGIN;
if (!origin || !/^https:\/\/[\w.-]+\.workers\.dev$/.test(origin)) {
  throw new Error("MEDIA_PUBLIC_ORIGIN must be a Worker HTTPS origin");
}

const imageFile = resolve(inputFile);
const bytes = await readFile(imageFile);
const extension = extname(imageFile).toLowerCase();
const contentTypes = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const contentType = contentTypes[extension];
if (!contentType) throw new Error("Supported images: jpg, png, webp, svg, ico");
const signatures = {
  ".jpg": () => bytes[0] === 255 && bytes[1] === 216,
  ".png": () => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  ".webp": () => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
  ".svg": () => /<svg[\s>]/.test(bytes.toString()),
  ".ico": () => bytes.length >= 4 && bytes.readUInt32LE(0) === 65536,
};
if (!signatures[extension]()) throw new Error(`Invalid image bytes: ${id}`);

const checksum = (data) => createHash("sha256").update(data).digest("hex");
const sha256 = checksum(bytes);
const key = `${kind === "channel" ? "channels" : "firms"}/${id}/${sha256}${extension}`;
const url = `${origin}/${key}`;
async function verified() {
  const response = await fetch(url);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${id}`);
  const remote = Buffer.from(await response.arrayBuffer());
  if (response.headers.get("content-type") !== contentType ||
      remote.length !== bytes.length || checksum(remote) !== sha256) {
    throw new Error(`Remote checksum/type mismatch: ${id}`);
  }
  return true;
}

const reused = await verified();
if (!reused) {
  const run = promisify(execFile);
  await run("pnpm", [
    "exec", "wrangler", "r2", "object", "put", `yt-equity-media/${key}`,
    "--file", imageFile, "--remote", "--content-type", contentType,
    "--cache-control", "public, max-age=31536000, immutable",
  ], { cwd: new URL(".", import.meta.url) });
  if (!await verified()) throw new Error(`Uploaded object missing: ${id}`);
}
console.log(JSON.stringify({ uploaded: Number(!reused), reused: Number(reused), verified: 1, origin, url }));
