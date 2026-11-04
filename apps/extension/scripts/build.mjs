import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function configuredOrigin(value, name, release) {
  if (!value) throw new Error(`${name} is required for release builds.`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, a path, query, or fragment.`);
  }
  if (release && (url.protocol !== "https:" || isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|test|invalid|example)$/.test(url.hostname))) {
    throw new Error(`${name} must be a public HTTPS origin for release builds.`);
  }
  return url.origin;
}

export async function buildExtension({ browser = "chrome", release = false, apiUrl, webUrl, outDir } = {}) {
  if (!["chrome", "firefox"].includes(browser)) throw new Error(`Unsupported browser: ${browser}`);
  apiUrl = configuredOrigin(apiUrl ?? (release ? undefined : "http://localhost:4000"), "API_PUBLIC_URL", release);
  webUrl = configuredOrigin(webUrl ?? (release ? undefined : "http://localhost:3000"), "WEB_URL", release);
  const target = resolve(outDir ?? join(root, "dist", browser));
  const manifest = JSON.parse(await readFile(join(root, `manifest.${browser}.json`), "utf8"));
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (manifest.version !== pkg.version) throw new Error("Package and manifest versions must match.");
  // Derive permissions from the actual endpoint; release packages contain no localhost grant.
  manifest.host_permissions = [`${apiUrl}/*`];
  manifest.homepage_url = `${webUrl}/`;
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of ["content.js", "content.css", "popup.css", "popup.js", "support.js", "background.js"]) {
    await cp(join(root, file), join(target, file));
  }
  const popup = await readFile(join(root, "popup.html"), "utf8");
  await writeFile(join(target, "popup.html"), popup.replaceAll("__WEB_URL__", webUrl));
  await writeFile(join(target, "config.js"), `globalThis.YT_EQUITY_CONFIG = ${JSON.stringify({ apiUrl, webUrl })};\n`);
  await cp(join(root, "icons"), join(target, "icons"), { recursive: true });
  await writeFile(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { browser, target, version: manifest.version, apiUrl, webUrl };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildExtension({
    browser: process.env.BROWSER ?? "chrome",
    release: process.argv.includes("--release"),
    apiUrl: process.env.API_PUBLIC_URL,
    webUrl: process.env.WEB_URL
  });
  console.log(`Built ${result.browser} ${result.version}: ${result.target}`);
}
