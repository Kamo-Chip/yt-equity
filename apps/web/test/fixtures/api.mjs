// Disposable UI API: no real authentication, database, or email calls.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
const ids = {
  channel: "00000000-0000-4000-8000-000000000001",
  firm: "00000000-0000-4000-8000-000000000002",
  otherFirm: "00000000-0000-4000-8000-000000000003",
  claim: "00000000-0000-4000-8000-000000000004",
  otherClaim: "00000000-0000-4000-8000-000000000005",
};
const channel = {
  id: ids.channel,
  channelId: "UCtest",
  name: "Shared channel",
  handle: "@shared",
};
const firm = {
    id: ids.firm,
    name: "Test firm",
    website: "https://example.com",
  },
  otherFirm = { id: ids.otherFirm, name: "Second firm" };
const source = {
  url: "https://example.com/announcement",
  title: "Acquisition announcement",
  tier: "official",
};
const seedRelationships = [
  {
    id: ids.claim,
    channel,
    firm,
    type: "acquisition",
    status: "confirmed",
    confidence: 95,
    published: true,
    announcedAt: null,
    sources: [source],
  },
  {
    id: ids.otherClaim,
    channel,
    firm: otherFirm,
    type: "funding",
    status: "confirmed",
    confidence: 90,
    published: true,
    announcedAt: null,
    sources: [source],
  },
];
const seedQueue = [
  {
    id: "00000000-0000-4000-8000-000000000006",
    kind: "correction",
    channelId: "UCtest",
    status: "pending",
    createdAt: "2026-11-01T12:00:00Z",
    payload: {
      explanation: "Please check this ownership announcement.",
      claimId: ids.claim,
      sources: ["https://example.com/new-source"],
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    kind: "dispute",
    channelId: "UCtest",
    status: "pending",
    createdAt: "2026-11-02T12:00:00Z",
    payload: {
      explanation: "This acquisition may be incomplete.",
      sources: [source.url],
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    kind: "feedback",
    channelId: null,
    status: "pending",
    createdAt: "2026-11-03T12:00:00Z",
    payload: { explanation: "The interface could be clearer." },
  },
];
let relationships,
  queue,
  channels,
  firms,
  invitations = [],
  users = [],
  nextFailure = null,
  graphDelay = 0,
  responseDelays = new Map(),
  activity = [],
  requests = [];
function reset() {
  relationships = structuredClone(seedRelationships);
  queue = structuredClone(seedQueue);
  channels = [structuredClone(channel)];
  firms = structuredClone([firm, otherFirm]);
  graphDelay = 0;
  responseDelays.clear();
  activity = [];
  nextFailure = null;
  invitations = [];
  users = [{ id: "test-moderator", email: "moderator@example.com", role: "moderator", createdAt: "2026-11-01T10:00:00Z" }];
  requests = [];
}
reset();
const summarize = (r) => {
  const { sources, ...rest } = r;
  return rest;
};
const pageResult = (items, params) => {
  const page = Number(params.get("page") ?? 1),
    pageSize = Number(params.get("pageSize") ?? 25);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  };
};
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"),
    path = url.pathname,
    params = url.searchParams;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const data = raw ? JSON.parse(raw) : {};
  const role = (req.headers.cookie ?? "").match(
    /fixture-role=(admin|moderator)/,
  )?.[1];
  let result,
    status = 200;
  if (!path.startsWith("/__"))
    requests.push({ path, search: url.search, method: req.method, hasCookie: Boolean(req.headers.cookie), ...(["/api/v1/submissions", "/api/v1/reports"].includes(path) ? { data, clientKey: (req.headers["x-yt-equity-client"] ?? "").split(".")[0], signedClient: /^(?:[0-9a-f-]{36}|[0-9a-f]{64})\.\d+\.[0-9a-f]{64}$/i.test(req.headers["x-yt-equity-client"] ?? "") } : {}) });
  if (responseDelays.has(path)) await new Promise(resolve => setTimeout(resolve, responseDelays.get(path)));
  if (path === "/__reset") {
    reset();
    result = { ok: true };
  } else if (path === "/__empty-graph") {
    relationships = [];
    result = { ok: true };
  } else if (path === "/__admin-data") { users = data.users ?? users; invitations = data.invitations ?? invitations; result = { ok: true };
  } else if (path === "/__activity") { activity = data.items; result = { ok: true };
  } else if (path === "/__fail-next") { nextFailure = data; result = { ok: true }; }
  else if (nextFailure && path === nextFailure.path && req.method === nextFailure.method) {
    status = nextFailure.status ?? 503;
    result = { error: { message: nextFailure.message ?? "Please retry this save.", code: "SERVICE_UNAVAILABLE" } };
    nextFailure = null;
  } else if (path === "/__requests") result = requests;
  else if (path === "/__delay") {
    if (data.path) responseDelays.set(data.path, Math.min(Number(data.ms) || 0, 5000));
    else graphDelay = Math.min(Number(data.ms) || 0, 5000);
    result = { ok: true };
  } else if (path === "/__many") {
    for (let i = 0; i < (data.firms ?? 0); i++) {
      const extraFirm = { id: randomUUID(), name: "Fixture firm " + i };
      firms.push(extraFirm);
      relationships.push({ ...seedRelationships[0], id: randomUUID(), firm: extraFirm });
    }
    for (let i = 0; i < (data.undisclosed ?? 0); i++)
      relationships.push({ ...seedRelationships[0], id: randomUUID(), firm: null });
    for (let i = 0; i < (data.otherChannels ?? 0); i++)
      relationships.push({
        ...seedRelationships[1], id: randomUUID(),
        channel: { ...channel, id: randomUUID(), channelId: "UCother" + i, handle: "@other" + i, name: "Other channel " + i },
      });
    for (let i = 0; i < (data.reports ?? 0); i++)
      queue.push({
        id: randomUUID(),
        kind: "correction",
        channelId: "UCtest",
        status: "pending",
        createdAt: new Date(Date.UTC(2026, 10, 4, i)).toISOString(),
        payload: { explanation: "Extra report " + i, sources: [source.url] },
      });
    result = { ok: true };
  } else if (path === "/health") result = { ok: true };
  else if (
    (path.startsWith("/api/v1/moderator/") ||
      path.startsWith("/api/v1/admin/") ||
      path === "/api/v1/workspace/session") &&
    !role
  ) {
    status = 401;
    result = { error: { message: "Sign in required", code: "UNAUTHORIZED" } };
  } else if (path.startsWith("/api/v1/admin/") && role !== "admin") {
    status = 403;
    result = {
      error: { message: "Administrator access required", code: "FORBIDDEN" },
    };
  } else if (path === "/api/v1/workspace/session") result = { role };
  else if (path === "/api/auth/sign-out") {
    res.setHeader("set-cookie", "fixture-role=; Path=/; Max-Age=0");
    result = { success: true };
  } else if (path === "/api/v1/moderator/media" && req.method === "POST") {
    result = { url: `https://media.example/uploads/${data.kind}/test.webp` };
  } else if (path === "/api/v1/moderator/inbox") {
    const q = (params.get("q") ?? "").toLowerCase(),
      kind = params.get("kind") ?? "all";
    const pending = queue.filter(
      (s) =>
        s.status === "pending" &&
        (!q ||
          [s.channelId, s.payload.explanation].some((v) =>
            v?.toLowerCase().includes(q),
          )),
    );
    const counts = {
      all: pending.length,
      reports: pending.filter((s) => !["dispute", "feedback"].includes(s.kind))
        .length,
      disputes: pending.filter((s) => s.kind === "dispute").length,
      feedback: pending.filter((s) => s.kind === "feedback").length,
    };
    const items = pending.filter(
      (s) =>
        kind === "all" ||
        (kind === "reports" && !["dispute", "feedback"].includes(s.kind)) ||
        (kind === "disputes" && s.kind === "dispute") ||
        (kind === "feedback" && s.kind === "feedback"),
    );
    result = { ...pageResult(items, params), counts };
  } else if (path.endsWith("/context")) {
    const submission = queue.find((s) => s.id === path.split("/")[5]);
    if (!submission) {
      status = 404;
      result = { error: { message: "Not found" } };
    } else
      result = {
        submission,
        channel: submission.channelId ? channel : null,
        relationships: submission.channelId
          ? relationships
              .filter((r) => r.channel.id === channel.id)
              .map(summarize)
          : [],
      };
  } else if (path.endsWith("/decision")) {
    const item = queue.find((s) => s.id === path.split("/")[5]);
    if (!item || item.status !== "pending") {
      status = 409;
      result = {
        error: {
          message: "This report was already reviewed.",
          code: "DECISION_EXISTS",
        },
      };
    } else {
      item.status = data.status;
      result = { ok: true };
    }
  } else if (path === "/api/v1/moderator/directory") {
    const resource = params.get("resource") ?? "relationships",
      q = (params.get("q") ?? "").toLowerCase();
    let items =
      resource === "relationships"
        ? relationships.map(summarize)
        : resource === "channels"
          ? channels
          : firms;
    items = items.filter(
      (r) =>
        (!q ||
          (resource === "relationships"
            ? [
                r.channel.name,
                r.channel.handle,
                r.channel.channelId,
                r.firm?.name,
              ]
            : [r.name, r.channelId, r.handle, r.website]
          ).some((v) => v?.toLowerCase().includes(q))) &&
        (!params.get("type") ||
          params.get("type") === "all" ||
          r.type === params.get("type")) &&
        (!params.get("status") ||
          params.get("status") === "all" ||
          r.status === params.get("status")) &&
        (!params.get("publication") ||
          params.get("publication") === "all" ||
          r.published === (params.get("publication") === "published")),
    );
    const sort = params.get("sort"), direction = params.get("direction") === "desc" ? -1 : 1;
    if (sort) {
      const value = item => sort === "name" ? (resource === "relationships" ? item.channel.name : item.name)
        : sort === "status" ? item.status
        : resource === "relationships" ? `${item.type} ${item.firm?.name ?? "an undisclosed firm"}`
        : resource === "channels" ? item.handle ?? item.channelId : item.website ?? "";
      items.sort((a, b) => direction * value(a).localeCompare(value(b)) || a.id.localeCompare(b.id));
    }
    result = { resource, ...pageResult(items, params) };
  } else if (path === "/api/v1/moderator/audit-events") result = activity;
  else if (/^\/api\/v1\/moderator\/relationships\/[^/]+\/archive$/.test(path) && req.method === "POST") {
    const record = relationships.find(record => record.id === path.split("/")[5]);
    if (record) { record.published = false; result = { ok: true }; }
    else { status = 404; result = { error: { message: "Relationship not found" } }; }
  } else if (path.startsWith("/api/v1/moderator/relationships")) {
    const id = path.split("/")[5];
    if (req.method === "GET") {
      result = id ? relationships.find((r) => r.id === id) : undefined;
      if (!result) {
        status = 404;
        result = { error: { message: "Relationship not found" } };
      }
    } else {
      const c =
        "id" in data.channel
          ? channels.find((c) => c.id === data.channel.id)
          : { ...data.channel, id: randomUUID() };
      if (!("id" in data.channel)) channels.push(c);
      const f = data.firm
        ? "id" in data.firm
          ? firms.find((f) => f.id === data.firm.id)
          : { ...data.firm, id: randomUUID() }
        : null;
      if (data.firm && !("id" in data.firm)) firms.push(f);
      result = { ...data, id: id ?? randomUUID(), channel: c, firm: f };
      relationships = [
        result,
        ...relationships.filter((r) => r.id !== result.id),
      ];
    }
  } else if (/^\/api\/v1\/moderator\/(channels|firms)\//.test(path) && req.method === "PATCH") {
    result = (path.includes("/channels/") ? channels : firms).find(c => c.id === path.split("/")[5]);
    if (result) Object.assign(result, data);
    else { status = 404; result = { error: { message: "Channel not found" } }; }
  } else if (req.method === "GET" && ["/api/v1/admin/moderators/users", "/api/v1/admin/moderators/invitations"].includes(path)) {
    const isUsers = path.endsWith("/users"), q = (params.get("q") ?? "").toLowerCase();
    let items = isUsers ? users.filter(person => person.role === "moderator") : invitations.map(invitation => ({ ...invitation, status: invitation.acceptedAt ? "accepted" : invitation.revokedAt ? "revoked" : new Date(invitation.expiresAt) <= new Date() ? "expired" : "pending" }));
    items = items.filter(item => item.email.toLowerCase().includes(q) && (isUsers || !params.get("status") || params.get("status") === "all" || item.status === params.get("status")));
    const sort = params.get("sort") ?? (isUsers ? "createdAt" : "lastSentAt"), direction = params.get("direction") === "asc" ? 1 : -1;
    items.sort((a, b) => a[sort] == null ? b[sort] == null ? a.id.localeCompare(b.id) : 1 : b[sort] == null ? -1 : direction * String(a[sort]).localeCompare(String(b[sort])) || a.id.localeCompare(b.id));
    result = pageResult(items, params);
  }
  else if (path === "/api/v1/admin/moderators/invitations") {
    result = { id: "test-invitation-" + data.email, email: data.email, expiresAt: "2027-01-01T00:00:00Z", acceptedAt: null, revokedAt: null, lastSentAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    invitations = [result, ...invitations.filter(i => i.email !== data.email)];
  } else if (path.endsWith("/revoke")) {
    users = users.filter(u => u.id !== path.split("/")[5]);
    result = { ok: true };
  }
  else if (path.startsWith("/api/v1/firms/"))
    result = {
      ...firm,
      claims: relationships.filter((r) => r.firm?.id === firm.id && r.published && r.status === "confirmed"),
    };
  else if (path === "/api/v1/ownership-graph") {
    if (graphDelay)
      await new Promise((resolve) => setTimeout(resolve, graphDelay));
    const records = relationships.filter(
      (r) => r.published && r.status === "confirmed",
    ).map(record => ({ ...record, firm: record.firm ?? { id: `undisclosed:${record.id}`, name: "Undisclosed firm", undisclosed: true } }));
    result = {
      nodes: [
        ...new Map(
          records.map((r) => [
            "firm:" + r.firm.id,
            {
              id: "firm:" + r.firm.id,
              kind: "firm",
              name: r.firm.name,
              profilePictureUrl: r.firm.profilePictureUrl,
              profilePictureBackground: r.firm.profilePictureBackground,
              ...(r.firm.undisclosed ? { undisclosed: true } : {}),
              channelCount: new Set(
                records
                  .filter((other) => other.firm.id === r.firm.id)
                  .map((other) => other.channel.id),
              ).size,
            },
          ]),
        ).values(),
        ...new Map(
          records.map((r) => [
            "channel:" + r.channel.id,
            { ...r.channel, id: "channel:" + r.channel.id, kind: "channel" },
          ]),
        ).values(),
      ],
      edges: records.map((r) => ({
        ...r,
        source: "firm:" + r.firm.id,
        target: "channel:" + r.channel.id,
        evidenceTiers: ["official"],
      })),
    };
  } else if (["/api/v1/submissions", "/api/v1/reports", "/api/auth/sign-in/magic-link"].includes(path) && req.method === "POST") {
    result = { ok: true };
  } else if (["/api/v1/channels/UCtest", "/api/v1/channels/%40test"].includes(path))
    result = { ...channels[0], aliases: [], claims: relationships.filter(r => r.published && r.status === "confirmed") };
  else {
    status = 404;
    result = { error: { message: "Fixture route not found" } };
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(result));
}).listen(Number(process.env.PORT ?? 4101), "127.0.0.1", () => console.log("UI fixture API ready"));
