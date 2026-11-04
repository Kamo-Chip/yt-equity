import { configuredOrigin } from "./build.mjs";

const apiUrl = configuredOrigin(process.env.API_PUBLIC_URL, "API_PUBLIC_URL", true);
const webUrl = configuredOrigin(process.env.WEB_URL, "WEB_URL", true);
async function get(url, options = {}) {
  const response = await fetch(url, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(15_000), ...options });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}
const checks = [
  ["API health", async () => {
    const body = await (await get(`${apiUrl}/health`)).json();
    if (body.ok !== true) throw new Error("API health response is invalid.");
  }],
  ["Public channel lookup", async () => {
    const body = await (await get(`${apiUrl}/api/v1/channels/lookup`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifiers: ["@kamoio"] })
    })).json();
    const item = body.results?.find(result => result.identifier === "@kamoio");
    if (!item || (item.channel !== null && (typeof item.channel?.channelId !== "string" || !Array.isArray(item.channel?.claims)))) {
      throw new Error("Lookup response does not match the extension contract.");
    }
  }],
  ["Public privacy policy", async () => {
    const html = await (await get(`${webUrl}/privacy`)).text();
    if (!["Extension privacy policy", "What the extension sends", "Service processing and retention", "Contact and changes"].every(text => html.includes(text))) {
      throw new Error("The deployed privacy policy is missing or is not the extension policy.");
    }
  }],
  ["Public contact form", async () => {
    const html = await (await get(`${webUrl}/report`)).text();
    if (!html.includes("report-explanation") || !html.includes("report-email")) throw new Error("The deployed contact form is missing.");
  }]
];
let failures = 0;
for (const [name, check] of checks) {
  try { await check(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`); }
}
if (failures) {
  process.exitCode = 1;
  console.error("Deployment is not ready for store submission. Resolve these checks before uploading.");
}
