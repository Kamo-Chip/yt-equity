import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, test } from "node:test";
import { testApp } from "./helpers/app.mjs";

const { app, db, schema } = await testApp();
after(() => app.close());

test("live lookup checks pass across HTTP against an isolated seeded API", async () => {
  const [firm] = await db.insert(schema.firms).values({ name: "HTTP fixture firm" }).returning();
  const [channel] = await db.insert(schema.channels).values({ channelId: "UCabcdefghijkLMNOPQRSTUV", handle: "@HttpFixture", name: "HTTP fixture channel" }).returning();
  await db.insert(schema.claims).values({ channelId: channel.id, firmId: firm.id, type: "funding", status: "confirmed", published: true });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const child = spawn(process.execPath, ["--test", new URL("./integration/channel-lookup.test.mjs", import.meta.url).pathname], {
    env: { ...process.env, API_TEST_URL: address }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  assert.equal(status, 0, output);
});
