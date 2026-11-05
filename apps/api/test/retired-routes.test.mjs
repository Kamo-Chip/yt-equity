import assert from "node:assert/strict";
import { after, test } from "node:test";
import { testApp } from "./helpers/app.mjs";
const { app } = await testApp();
after(() => app.close());
const id = "00000000-0000-4000-8000-000000000001";
test("superseded routes return 404 even for an administrator", async () => {
  const routes = [
    ["GET", "/api/v1/channels"], ["GET", "/api/v1/firms"], ["GET", "/api/v1/admin/moderators"],
    ...["channels", "firms", "claims", "evidence", "relationships", "submissions"].map(resource => ["GET", "/api/v1/moderator/" + resource]),
    ["GET", `/api/v1/moderator/submissions/${id}`],
    ...["claims", "evidence"].flatMap(resource => [["POST", `/api/v1/moderator/${resource}`], ["PATCH", `/api/v1/moderator/${resource}/${id}`]]),
    ["DELETE", `/api/v1/moderator/evidence/${id}`], ["POST", `/api/v1/moderator/claims/${id}/archive`],
    ["GET", `/api/v1/moderator/channels/${id}/aliases`], ["POST", `/api/v1/moderator/channels/${id}/aliases`], ["DELETE", `/api/v1/moderator/aliases/${id}`],
  ];
  for (const [method, url] of routes) {
    const response = await app.inject({ method, url, headers: { "x-test-role": "admin" }, ...(["POST", "PATCH"].includes(method) ? { payload: {} } : {}) });
    assert.equal(response.statusCode, 404, `${method} ${url}: ${response.body}`);
  }
});
