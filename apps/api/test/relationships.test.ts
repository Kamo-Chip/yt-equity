import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { testApp } from "./helpers/app.mjs";
let activeSession: unknown = null;
const { app, pg, db: testDb, schema } = await testApp({ getSession: async () => activeSession });
const selectSpy = mock.method(testDb, "select", testDb.select.bind(testDb));
after(() => app.close());
const payload = {
  channel: { channelId: "UCrelationship", name: "Test channel" },
  firm: { name: "Test firm" },
  type: "funding",
  status: "confirmed",
  confidence: 90,
  published: false,
  sources: [{ url: "https://example.com/announcement", tier: "official" }],
};
let relationship: any;
async function write(data: unknown = payload, id?: string) {
  return app.inject({
    method: id ? "PATCH" : "POST",
    url: "/api/v1/moderator/relationships" + (id ? "/" + id : ""),
    payload: data,
  });
}
test("readiness returns unavailable while warming and ready after the snapshot loads", async () => {
  assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/health/ready" })).statusCode, 503);
  assert.equal((await app.inject({ url: "/api/v1/ownership-graph" })).statusCode, 200);
  const before = selectSpy.mock.callCount();
  assert.equal((await app.inject({ url: "/health/ready" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/api/v1/ownership-graph" })).headers["x-graph-cache"], "HIT");
  assert.equal(selectSpy.mock.callCount(), before);
});

test("relationship endpoints require moderator authorization", async () => {
  for (const [method, url] of [
    ["GET", "/api/v1/moderator/directory?resource=relationships"],
    [
      "GET",
      "/api/v1/moderator/relationships/00000000-0000-0000-0000-000000000000",
    ],
    ["POST", "/api/v1/moderator/relationships"],
    [
      "PATCH",
      "/api/v1/moderator/relationships/00000000-0000-0000-0000-000000000000",
    ],
  ] as const)
    assert.equal(
      (
        await app.inject({
          method,
          url,
          payload: method === "GET" ? undefined : payload,
        })
      ).statusCode,
      401,
    );
  activeSession = { user: { id: "ordinary-user", role: null } };
  assert.equal(
    (await app.inject({ url: "/api/v1/moderator/directory?resource=relationships" })).statusCode,
    403,
  );
  assert.equal((await write()).statusCode, 403);
  activeSession = { user: { id: "admin-user", role: "admin" } };
  assert.equal(
    (await app.inject({ url: "/api/v1/moderator/directory?resource=relationships" })).statusCode,
    200,
  );
  activeSession = { user: { id: "test-moderator", role: "moderator" } };
});
test("draft creation groups inline entities, evidence and audit without public visibility", async () => {
  const response = await write();
  assert.equal(response.statusCode, 201, response.body);
  relationship = response.json();
  assert.equal(relationship.channel.name, "Test channel");
  assert.equal(relationship.firm.name, "Test firm");
  assert.equal(relationship.sources.length, 1);
  assert.equal(
    (await testDb.select().from(schema.auditEvents)).filter(
      (a) => a.entityId === relationship.id,
    ).length,
    1,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/ownership-graph" })).json().edges.length,
    0,
  );
});
test("publication, evidence replacement, nullable firm/date and archive affect public records", async () => {
  const base = {
    ...payload,
    channel: { id: relationship.channel.id },
    firm: { id: relationship.firm.id },
    published: true,
    announcedAt: "2026-01-01T00:00:00.000Z",
  };
  let response = await write(base, relationship.id);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(
    (await app.inject({ url: "/api/v1/ownership-graph" })).json().edges.length,
    1,
  );
  response = await write({ ...base, status: "provisional" }, relationship.id);
  assert.equal(response.statusCode, 400);
  response = await write(
    { ...base, status: "provisional", published: false },
    relationship.id,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/v1/ownership-graph" })).json().edges.length,
    0,
  );
  response = await write(
    {
      ...base,
      sources: [{ url: "https://example.com/replacement", tier: "reputable" }],
      announcedAt: null,
    },
    relationship.id,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().announcedAt, null);
  assert.deepEqual(
    response.json().sources.map((s: any) => s.url),
    ["https://example.com/replacement"],
  );
  const publicGraph = (
    await app.inject({ url: "/api/v1/ownership-graph" })
  ).json();
  assert.equal(publicGraph.edges.length, 1);
  assert.equal(
    publicGraph.edges[0].sources[0].url,
    "https://example.com/replacement",
  );
  response = await write({ ...base, firm: null }, relationship.id);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().firm, null);
  await write(base, relationship.id);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/moderator/relationships/${relationship.id}/archive`,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/ownership-graph" })).json().edges.length,
    0,
  );
});
test("invalid data and nonexistent references preserve previous records", async () => {
  const before = (
    await app.inject({
      url: `/api/v1/moderator/relationships/${relationship.id}`,
    })
  ).json();
  assert.equal(
    (await write({ ...payload, confidence: 101 }, relationship.id)).statusCode,
    400,
  );
  assert.equal(
    (
      await write(
        { ...payload, channel: { id: "00000000-0000-0000-0000-000000000001" } },
        relationship.id,
      )
    ).statusCode,
    400,
  );
  assert.deepEqual(
    (
      await app.inject({
        url: `/api/v1/moderator/relationships/${relationship.id}`,
      })
    ).json(),
    before,
  );
  const duplicate = await write();
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  assert.equal(
    (await app.inject({ url: "/api/v1/moderator/relationships/not-an-id" }))
      .statusCode,
    400,
  );
});
test("failure during evidence replacement rolls back claim, entities, sources and audit", async () => {
  const before = (
    await app.inject({
      url: `/api/v1/moderator/relationships/${relationship.id}`,
    })
  ).json();
  const auditCount = (await testDb.select().from(schema.auditEvents)).length;
  await pg.exec(
    "CREATE FUNCTION reject_evidence() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected test failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER fail_evidence BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION reject_evidence();",
  );
  const response = await write(
    {
      ...payload,
      channel: { id: relationship.channel.id },
      firm: { name: "Rolled back firm" },
      published: true,
    },
    relationship.id,
  );
  assert.equal(response.statusCode, 500);
  await pg.exec(
    "DROP TRIGGER fail_evidence ON evidence; DROP FUNCTION reject_evidence();",
  );
  assert.deepEqual(
    (
      await app.inject({
        url: `/api/v1/moderator/relationships/${relationship.id}`,
      })
    ).json(),
    before,
  );
  assert.equal(
    (
      await testDb
        .select()
        .from(schema.firms)
        .where(eq(schema.firms.name, "Rolled back firm"))
    ).length,
    0,
  );
  assert.equal(
    (await testDb.select().from(schema.auditEvents)).length,
    auditCount,
  );
});
test("approving a submission does not change directory data", async () => {
  const [submission] = await testDb
    .insert(schema.submissions)
    .values({
      kind: "correction",
      channelId: "UCrelationship",
      payload: {
        explanation: "Test ownership report",
        sources: ["https://example.com/report"],
      },
    })
    .returning();
  const before = (
    await app.inject({ url: "/api/v1/moderator/directory?resource=relationships" })
  ).json();
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/moderator/submissions/${submission.id}/decision`,
    payload: { status: "approved" },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(
    (await app.inject({ url: "/api/v1/moderator/directory?resource=relationships" })).json(),
    before,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/moderator/submissions/${submission.id}/decision`,
        payload: { status: "approved" },
      })
    ).statusCode,
    409,
  );
});

test("entity editors can clear optional profile fields", async () => {
  let response = await app.inject({
    method: "PATCH",
    url: `/api/v1/moderator/channels/${relationship.channel.id}`,
    payload: {
      handle: "@profile",
      profilePictureUrl: "https://example.com/avatar.png",
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  response = await app.inject({
    method: "PATCH",
    url: `/api/v1/moderator/channels/${relationship.channel.id}`,
    payload: { handle: null, profilePictureUrl: null },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().handle, null);
  assert.equal(response.json().profilePictureUrl, null);
  response = await app.inject({
    method: "PATCH",
    url: `/api/v1/moderator/firms/${relationship.firm.id}`,
    payload: { website: null },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().website, null);
});

test("paginated moderation endpoints enforce access and validate queries", async () => {
  activeSession = null;
  for (const url of [
    "/api/v1/moderator/inbox",
    "/api/v1/moderator/directory",
    `/api/v1/moderator/submissions/${relationship.id}/context`,
  ])
    assert.equal((await app.inject({ url })).statusCode, 401);
  activeSession = { user: { id: "ordinary", role: null } };
  assert.equal(
    (await app.inject({ url: "/api/v1/moderator/inbox" })).statusCode,
    403,
  );
  activeSession = { user: { id: "test-moderator", role: "moderator" } };
  for (const url of [
    "/api/v1/moderator/inbox?page=0",
    "/api/v1/moderator/directory?pageSize=101",
    "/api/v1/moderator/directory?resource=invalid",
    "/api/v1/moderator/directory?sort=invalid",
    "/api/v1/moderator/directory?direction=invalid",
    "/api/v1/moderator/directory?resource=firms&sort=status",
  ])
    assert.equal((await app.inject({ url })).statusCode, 400);
});
test("inbox separates feedback and ownership reports, and resolves historical channel context", async () => {
  await testDb
    .insert(schema.channelAliases)
    .values({ channelId: relationship.channel.id, alias: "@old-handle" });
  const created = await testDb
    .insert(schema.submissions)
    .values([
      {
        kind: "feedback",
        payload: { explanation: "General interface feedback" },
      },
      {
        kind: "correction",
        channelId: "@OLD-HANDLE",
        payload: {
          explanation: "Ownership correction",
          claimId: relationship.id,
        },
      },
      {
        kind: "dispute",
        channelId: relationship.channel.channelId,
        payload: { explanation: "Ownership dispute" },
      },
    ])
    .returning();
  const queue = (
    await app.inject({ url: "/api/v1/moderator/inbox?pageSize=1" })
  ).json();
  assert.equal(queue.total, 3);
  assert.equal(queue.items.length, 1);
  assert.deepEqual(queue.counts, {
    all: 3,
    reports: 1,
    disputes: 1,
    feedback: 1,
  });
  const feedback = (
    await app.inject({ url: "/api/v1/moderator/inbox?kind=feedback" })
  ).json();
  assert.equal(feedback.items[0].kind, "feedback");
  const context = (
    await app.inject({
      url: `/api/v1/moderator/submissions/${created[1].id}/context`,
    })
  ).json();
  assert.equal(context.channel.id, relationship.channel.id);
  assert.ok(context.relationships.some((r: any) => r.id === relationship.id));
  const general = (
    await app.inject({
      url: `/api/v1/moderator/submissions/${created[0].id}/context`,
    })
  ).json();
  assert.equal(general.channel, null);
  assert.deepEqual(general.relationships, []);
});
test("simultaneous review decisions create only one decision and audit record", async () => {
  const [report] = await testDb
    .insert(schema.submissions)
    .values({
      kind: "feedback",
      payload: { explanation: "Concurrent decision test" },
    })
    .returning();
  const responses = await Promise.all(
    ["approved", "rejected"].map((status) =>
      app.inject({
        method: "POST",
        url: `/api/v1/moderator/submissions/${report.id}/decision`,
        payload: { status },
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(
    (
      await testDb
        .select()
        .from(schema.moderationDecisions)
        .where(eq(schema.moderationDecisions.submissionId, report.id))
    ).length,
    1,
  );
  assert.equal(
    (
      await testDb
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.entityId, report.id))
    ).length,
    1,
  );
});

test("public snapshot cache shares reads and invalidates directory writes but not review decisions", async () => {
  const created = await write({ ...payload, published: true,
    channel: { channelId: "UCcached", name: "Cache channel" }, firm: { name: "Cache firm" } });
  assert.equal(created.statusCode, 201, created.body);
  const cachedRelationship = created.json();
  const channelUrl = `/api/v1/moderator/channels/${cachedRelationship.channel.id}`;
  assert.equal((await app.inject({ method: "PATCH", url: channelUrl,
    payload: { name: "Cached channel" } })).statusCode, 200);
  const before = selectSpy.mock.callCount();
  const [first, concurrent] = await Promise.all([
    app.inject({ url: "/api/v1/ownership-graph" }),
    app.inject({ url: "/api/v1/ownership-graph" }),
  ]);
  assert.equal(first.headers["x-graph-cache"], "HIT");
  assert.equal(concurrent.headers["x-graph-cache"], "HIT");
  assert.equal(selectSpy.mock.callCount() - before, 0);
  const hit = await app.inject({ url: "/api/v1/ownership-graph" });
  assert.equal(hit.headers["x-graph-cache"], "HIT");
  assert.equal(hit.headers["cache-control"], "no-store");
  assert.equal(hit.headers["x-graph-snapshot-age"], "0");
  assert.deepEqual(hit.json(), first.json());
  assert.equal(selectSpy.mock.callCount() - before, 0);

  // Failed validation and review decisions do not change the directory.
  assert.equal((await app.inject({ method: "PATCH", url: channelUrl,
    payload: { name: "" } })).statusCode, 400);
  const [report] = await testDb.insert(schema.submissions).values({
    kind: "correction", channelId: "UCrelationship", payload: {},
  }).returning();
  assert.equal((await app.inject({ method: "POST",
    url: `/api/v1/moderator/submissions/${report.id}/decision`,
    payload: { status: "approved" } })).statusCode, 200);
  assert.equal((await app.inject({ url: "/api/v1/ownership-graph" })).headers["x-graph-cache"], "HIT");

  const record = hit.json().edges.find((edge: any) => edge.id === cachedRelationship.id);
  const editor = (await app.inject({ url: `/api/v1/moderator/relationships/${record.id}` })).json();
  assert.equal((await write({ ...editor, channel: { id: editor.channel.id }, firm: editor.firm ? { id: editor.firm.id } : null,
    sources: editor.sources.map((source: any) => ({ ...source, title: "Fresh evidence" })) }, record.id)).statusCode, 200);
  const refreshed = await app.inject({ url: "/api/v1/ownership-graph" });
  assert.equal(refreshed.headers["x-graph-cache"], "HIT");
  assert.equal(refreshed.json().edges.find((edge: any) => edge.id === record.id).sources[0].title, "Fresh evidence");
  assert.equal((await app.inject({ method: "POST",
    url: `/api/v1/moderator/relationships/${record.id}/archive` })).statusCode, 200);
  const archived = await app.inject({ url: "/api/v1/ownership-graph" });
  assert.equal(archived.headers["x-graph-cache"], "HIT");
  assert.ok(!archived.json().edges.some((edge: any) => edge.id === record.id));
});

test("graph joins retain every source once and relationships without evidence", async () => {
  const { readOwnershipGraph } = await import("../src/ownership-graph.js");
  const [record, empty] = await testDb.insert(schema.claims).values([
    { channelId: relationship.channel.id, firmId: relationship.firm.id, type: "funding", status: "confirmed", published: true, confidence: 80 },
    { channelId: relationship.channel.id, firmId: relationship.firm.id, type: "acquisition", status: "confirmed", published: true, confidence: 90 },
  ]).returning();
  await testDb.insert(schema.evidence).values([
    { claimId: record.id, url: "https://example.com/first", tier: "official" },
    { claimId: record.id, url: "https://example.com/second", tier: "reputable" },
  ]);
  const graph = await readOwnershipGraph(testDb, {});
  assert.equal(graph.edges.filter(e => e.id === record.id).length, 1);
  assert.deepEqual(graph.edges.find(e => e.id === record.id)?.sources.map(s => s.url), ["https://example.com/first", "https://example.com/second"]);
  assert.deepEqual(graph.edges.find(e => e.id === empty.id)?.sources, []);
  const filtered = await readOwnershipGraph(testDb, { evidenceTier: "official" });
  assert.equal(filtered.edges.find(e => e.id === record.id)?.sources.length, 2);
  assert.ok(!filtered.edges.some(e => e.id === empty.id));
});

test("a failed post-commit rebuild preserves mutation success and discards the old snapshot", async () => {
  const originalSelect = testDb.select.bind(testDb);
  const failing = mock.method(testDb, "select", ((fields: any) => {
    if (fields?.source === schema.evidence) throw new Error("Snapshot read unavailable");
    return originalSelect(fields);
  }) as never);
  try {
    const result = await app.inject({ method: "PATCH",
      url: `/api/v1/moderator/channels/${relationship.channel.id}`,
      payload: { name: "Committed despite rebuild failure" } });
    assert.equal(result.statusCode, 200);
    const [saved] = await testDb.select().from(schema.channels).where(eq(schema.channels.id, relationship.channel.id));
    assert.equal(saved.name, "Committed despite rebuild failure");
    assert.equal((await app.inject({ url: "/health/ready" })).statusCode, 503);
    assert.equal((await app.inject({ url: "/api/v1/ownership-graph" })).statusCode, 503);
  } finally { failing.mock.restore(); }
  // A later directory write explicitly retries immediately and restores readiness.
  assert.equal((await app.inject({ method: "PATCH",
    url: `/api/v1/moderator/channels/${relationship.channel.id}`,
    payload: { name: "Recovered snapshot" } })).statusCode, 200);
  assert.equal((await app.inject({ url: "/health/ready" })).statusCode, 200);
});


test("directory sorts the complete result before pagination with stable tie breakers", async () => {
  activeSession = { user: { id: "sort-moderator", role: "moderator" } };
  const sortedChannels = await testDb.insert(schema.channels).values(["C", "A", "B"].map(letter => ({ channelId: "UCsort" + letter, name: "Sort channel " + letter, handle: "@sort" + letter }))).returning();
  await testDb.insert(schema.claims).values(sortedChannels.map((channel, index) => ({ channelId: channel.id, type: "funding" as const, status: (["provisional", "confirmed", "disputed"] as const)[index], published: false })));
  async function read(query: string) {
    const response = await app.inject({ url: "/api/v1/moderator/directory?q=Sort%20channel&" + query });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  const first = await read("resource=channels&sort=name&direction=desc&pageSize=2"), second = await read("resource=channels&sort=name&direction=desc&pageSize=2&page=2");
  assert.equal(first.total, 3);
  assert.deepEqual([...first.items, ...second.items].map((item: any) => item.name), ["Sort channel C", "Sort channel B", "Sort channel A"]);
  const ascending = await read("resource=relationships&sort=name&direction=asc");
  assert.deepEqual(ascending.items.map((item: any) => item.channel.name), ["Sort channel A", "Sort channel B", "Sort channel C"]);
  const statuses = await read("resource=relationships&sort=status&direction=asc");
  assert.deepEqual(statuses.items.map((item: any) => item.status), ["confirmed", "disputed", "provisional"]);
  const firmRecords = await testDb.insert(schema.firms).values([{ name: "Sort firm Z", website: "https://a.example.com" }, { name: "Sort firm A", website: "https://z.example.com" }]).returning();
  const firmsByWebsite = await app.inject({ url: "/api/v1/moderator/directory?resource=firms&q=Sort%20firm&sort=details&direction=asc" });
  assert.equal(firmsByWebsite.statusCode, 200, firmsByWebsite.body);
  assert.deepEqual(firmsByWebsite.json().items.map((item: any) => item.id), firmRecords.map(item => item.id));
});


test("admin list reads enforce roles and validate table queries", async () => {
  for (const endpoint of ["users", "invitations"]) {
    activeSession = null;
    assert.equal((await app.inject({ url: "/api/v1/admin/moderators/" + endpoint })).statusCode, 401);
    activeSession = { user: { id: "moderator", role: "moderator" } };
    assert.equal((await app.inject({ url: "/api/v1/admin/moderators/" + endpoint })).statusCode, 403);
    activeSession = { user: { id: "admin", role: "admin" } };
    for (const query of ["page=0", "pageSize=101", "sort=invalid", "direction=invalid"]) assert.equal((await app.inject({ url: "/api/v1/admin/moderators/" + endpoint + "?" + query })).statusCode, 400);
  }
  assert.equal((await app.inject({ url: "/api/v1/admin/moderators/invitations?status=invalid" })).statusCode, 400);
});

test("admin table queries sort and filter before pagination and expose only display fields", async () => {
  activeSession = { user: { id: "admin", role: "admin" } };
  const now = new Date();
  await testDb.insert(schema.user).values(["c", "a", "b"].map(letter => ({ id: "admin-table-" + letter, name: letter, email: letter + "@admin-table.test", role: "moderator" as const, emailVerified: true, createdAt: now, updatedAt: now })));
  await testDb.insert(schema.user).values({ id: "admin-table-admin", name: "Admin", email: "owner@admin-table.test", role: "admin", emailVerified: true, createdAt: now, updatedAt: now });
  const first = (await app.inject({ url: "/api/v1/admin/moderators/users?q=admin-table.test&sort=email&direction=asc&pageSize=2" })).json();
  const second = (await app.inject({ url: "/api/v1/admin/moderators/users?q=admin-table.test&sort=email&direction=asc&pageSize=2&page=2" })).json();
  assert.equal(first.total, 3);
  assert.deepEqual([...first.items, ...second.items].map((person: any) => person.email), ["a@admin-table.test", "b@admin-table.test", "c@admin-table.test"]);
  assert.deepEqual(Object.keys(first.items[0]).sort(), ["createdAt", "email", "id", "role"]);
  const past = new Date(now.getTime() - 10000), future = new Date(now.getTime() + 86400000);
  await testDb.insert(schema.moderatorInvitations).values([
    { email: "pending@admin-table.test", expiresAt: future },
    { email: "expired@admin-table.test", expiresAt: now },
    { email: "accepted@admin-table.test", expiresAt: past, acceptedAt: past, revokedAt: past },
    { email: "revoked@admin-table.test", expiresAt: past, revokedAt: past },
  ].map(item => ({ ...item, tokenHash: item.email, invitedBy: "admin", lastSentAt: past })));
  for (const status of ["pending", "expired", "accepted", "revoked"]) {
    const response = await app.inject({ url: "/api/v1/admin/moderators/invitations?q=admin-table.test&status=" + status });
    assert.equal(response.statusCode, 200, response.body);
    const data = response.json();
    assert.equal(data.total, 1);
    assert.equal(data.items[0].status, status);
    assert.equal("tokenHash" in data.items[0], false);
    assert.equal("invitedBy" in data.items[0], false);
  }
  const statuses = (await app.inject({ url: "/api/v1/admin/moderators/invitations?q=admin-table.test&sort=status&direction=asc" })).json();
  assert.deepEqual(statuses.items.map((item: any) => item.status), ["accepted", "expired", "pending", "revoked"]);
});
