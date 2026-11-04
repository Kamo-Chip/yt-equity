# YT Equity

YT Equity is a public, evidence-backed directory for researching funding and acquisition relationships across YouTube.

Public claims must be both published and confirmed. Provisional, disputed, rejected, and unpublished claims remain in the moderator workspace; approval of a submission does not publish a claim. Changing a confirmed claim to disputed removes it from public results on the next request (extension lookups may be cached for up to five minutes). Legacy public `status=provisional` and `status=disputed` filters return empty results.

## Workspace

- `apps/api` — Fastify API, Better Auth, moderator, and administrator endpoints
- `apps/web` — Next.js public directory plus protected moderator and administrator areas
- `apps/extension` — Chrome and Firefox extension builds
- `packages/db` — Neon + Drizzle schema, migrations, and seed import
- `packages/contracts` — shared Zod contracts

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Run `pnpm install`.
3. Run `pnpm --filter @yt-equity/db db:migrate`.
4. Run `pnpm --filter @yt-equity/db db:seed`.
5. Start the API, web app, and extension watcher with `pnpm dev`. The watcher builds both browsers against localhost and rebuilds when extension files change.

Run `pnpm --filter @yt-equity/api test` (Node 24+) for isolated public-visibility regression tests using disposable in-memory PostgreSQL fixtures. These tests do not connect to `DATABASE_URL`.

Run `pnpm --filter @yt-equity/api test:integration` against the running, seeded API to check profile and extension matching. Set `API_TEST_URL` to test an API other than `http://localhost:4000`. Handles and historical aliases match without regard to case; canonical `UC` channel IDs retain their case.

The extension watcher also runs alone with `pnpm --filter @yt-equity/extension dev`. For a one-time local build, use `pnpm --filter @yt-equity/extension build:chrome` or `pnpm --filter @yt-equity/extension build:firefox`. Local builds use `http://localhost:4000` for the API and `http://localhost:3000` for the site by default. In Chrome, choose **Load unpacked** and select `apps/extension/dist/chrome`—not `apps/extension` itself. In Firefox 142+, load `apps/extension/dist/firefox/manifest.json` through `about:debugging`. Ownership lookups work automatically. After each rebuild, reload the extension and refresh YouTube tabs.

The first administrator is bootstrapped with Better Auth magic links and database roles. After the administrator signs in once, promote the account in Neon with:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'admin@example.com';
```

Deploy the apps independently. The web host needs `API_INTERNAL_URL` and `WEB_ORIGIN`; the API host needs `DATABASE_URL`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, and Resend credentials. Extension builds use `API_PUBLIC_URL` and `WEB_URL`:

See [Railway deployment instructions](DEPLOYMENT.md) for Docker builds, production variables, migration/readiness gates, DNS, and rollback. Production starts use `pnpm --filter @yt-equity/api start` and `pnpm --filter @yt-equity/web start`; both validate required configuration before opening a port. Sign-in email delivery requires Resend; magic links are never printed to logs.

```bash
API_PUBLIC_URL=https://api.ytequity.com WEB_URL=https://www.ytequity.com pnpm --filter @yt-equity/extension release
# After deploying the site and API, this must pass before store submission:
API_PUBLIC_URL=https://api.ytequity.com WEB_URL=https://www.ytequity.com pnpm --filter @yt-equity/extension publish:check
```

Release builds require explicit public HTTPS URLs and contain only the configured API host permission. ZIPs and checksums are written to `apps/extension/dist/releases`. See [extension publishing instructions](apps/extension/PUBLISHING.md) for local setup, listing text, privacy declarations, and release checks. The website and API must be deployed before publishing.

The extension artifacts contain no channel database snapshot. They query the API and show a neutral unavailable state when it cannot be reached.

### Extension support

The extension popup coffee icon and the emoji popup’s Buy me a coffee button both show a confirmation dialog explaining YouTube Super Thanks. Cancel or Escape dismisses it; Continue opens the project video (`WNGNhItoRh8`) in a normal active browser tab with a `#yt-equity-thanks` marker. The helper pauses the video and prevents playback from restarting while the supporter stays on that page; navigating away releases the pause handlers. The packaged `support.js` consumes that marker and makes one attempt to open Super Thanks, including the video’s More actions menu when necessary. It waits up to 15 seconds for YouTube to load, then shows manual instructions if Thanks is unavailable. The helper currently recognizes English Thanks/More actions labels; other languages fall back to instructions. Ordinary video visits do not trigger it. Supporters choose an amount and confirm payment in YouTube. Rebuild and reload the extension after changing this flow.

The YouTube channel details popup also offers a subtle “Buy me a coffee” link below the record button. Its hover/focus tooltip explains that a YouTube video opens for Super Thanks, and the button asks the extension background script to open the same support video in a normal active tab. Its tooltip matches the extension popup.

### Extension privacy

Ownership lookups default on; no extra setup button or permission tab is shown. Updates and worker restarts never overwrite saved lookup or filter preferences, including an explicit pause saved by an earlier version. The popup contains filtering controls and a subtle footer link to `/privacy`. Disable the extension in the browser to stop automatic lookups. Lookup requests send only channel identifiers, omit credentials/referrers, and time out after ten seconds. Firefox declares browsing activity and website content transmission and requires version 142+.

The background and content scripts share lookup expiration timestamps, so a tab cannot extend a cached result with another five-minute TTL. Existing badges and channel controls refresh on the next reconciliation after expiry (normally within ten seconds in an active tab).

### Extension filtering

The popup has separate switches for acquired and funded channels, plus location switches for Home, Search results, Suggested videos, and Subscriptions. Both channel-type switches default off; Home, Search results, and Suggested videos default on, while Subscriptions defaults off. Existing acquisition preferences are preserved. Settings stay local to the browser profile.

Only confirmed records matching an enabled channel type and location are hidden. Suggested filtering covers the watch page’s related-video container; channel pages, playlists, Shorts, and other locations remain unfiltered. Hidden videos show a Reveal placeholder, and revealed cards remain visible until navigation. Settings apply immediately without a reload; ownership badges remain available regardless of filtering.

### Channel contributions

`/report/channel` accepts channel handles and IDs for ownership/funding reports, corrections, and disputes without sign-in. Profile actions prefill the channel and contribution type; legacy profile contribution URLs redirect to this page. Known handles resolve to canonical channel IDs on submission. Reports for unknown channels enter review as new-channel submissions; corrections and disputes require an existing channel. Evidence is required, submissions remain private, and publication remains a separate moderator action. `/report` remains available for general issues. The YouTube details popup links to the channel profile through “View full record” (or “View channel on YT Equity” when no record is published); reporting and disputes are available on the site.

### General issue reports

The extension footer links to `/report` for general website or extension feedback. Reports are private, require no sign-in, and appear in the private Inbox under General feedback. Apply the database migrations (`pnpm db:migrate`) before deploying this feature; migration `0003_general_reports` permits reports without a channel. Channel contribution validation is unchanged.

## Web interface and moderation

The web app uses Tailwind CSS and registry-installed shadcn components. It follows the system theme by default, with persistent light, dark, and system choices. Filters float directly on the graph canvas; reset appears after viewport changes or dragging. Initial graph data streams through React Suspense with skeletons; moderator, administrator, and profile routes also have Suspense loading skeletons. Add components from `apps/web` with `pnpm dlx shadcn@latest add <component>`; configuration lives in `apps/web/components.json`. The ownership graph is the homepage; `/channels` redirects there with its query parameters preserved. The extension and its API contracts are unchanged.

Moderator views use Server Components for headings, queues, report content, and tables. Inbox, report detail, directory, activity, and editor reads stream through separate Suspense boundaries with matching skeletons. Client components handle navigation controls, review decisions, and editable forms. Private reads remain uncached; React deduplication lasts only for the request.

Moderator cards and tables use shadcn components in a compact, centered 1280px layout, with flat workspace navigation, consistent segmented controls, and responsive filter toolbars. Directory column sorting runs in Fastify before pagination; the URL preserves sort direction, filters, and page size. Activity search and sorting cover the latest 200 events returned by the existing audit endpoint.

Moderators use Inbox, Directory, and Activity. Approving a report only records the review decision. Create or update a relationship separately, save a draft, and explicitly publish it. Public records still require both publication and confirmed status. An undisclosed firm is supported on channel profiles but has no firm node in the graph.

The moderator relationship API supports `GET /api/v1/moderator/relationships`, `GET /api/v1/moderator/relationships/:id`, `POST /api/v1/moderator/relationships`, and `PATCH /api/v1/moderator/relationships/:id`. Writes accept the shared `RelationshipEditor` contract: a channel reference or inline channel, an optional firm reference or inline firm, relationship fields, and a complete evidence list. Updates replace the relationship's evidence list. Channel/firm creation, claim changes, evidence replacement, and audit insertion run in one transaction. Existing moderator endpoints remain available.

Run `pnpm --filter @yt-equity/api test:relationships` for disposable Postgres tests covering grouped saves, publication, authorization, rollback, and approval isolation. Run `pnpm --filter @yt-equity/web exec playwright install chromium` once, then `pnpm --filter @yt-equity/web test:e2e` for browser checks. Browser tests start an isolated fixture API on port 4101 and a web instance on port 3100; neither uses the real database. The graph uses Dagre for stable ordering and a D3 spring simulation for draggable circular nodes, collisions, and fluid channel movement. Reduced-motion preferences disable automatic animated settling while retaining direct drag response. Firms stay anchored where dropped; released channels remain free to react to their connected firms, including shared channels. Re-expansion reheats remembered particles, and Reset view clears anchors and custom resting offsets.


### Navigation, review flow, and data loading

Public pages expose only Explore and Report an issue. Private access is available directly at `/moderator/sign-in` (or through invitations), with `/workspace` retained as a role-aware entry URL. Authentication pages have a separate layout; protected pages validate the session on the server and show one workspace navigation. Administrator controls remain role-restricted. The admin page uses the same compact shadcn layout as moderator views. Active moderators and invitation history stream independently through Suspense, with server-side filtering, sorting, and pagination through `GET /api/v1/admin/moderators/users` and `GET /api/v1/admin/moderators/invitations`. Table state uses separate `users` and `invitations` URL prefixes. Both reads are uncached, forward session cookies, and enforce admin permissions in Fastify; the combined legacy endpoint remains available. Signing out performs a full navigation to clear private browser state.

Approving an ownership report opens its exact relationship editor, or a named relationship choice when the match is ambiguous. Approval records the review decision only. Publication is a separate action and requires Confirmed status. Changing a published record to a non-confirmed status saves it as unpublished. General feedback decisions advance the queue without opening a relationship editor. Browser Back, internal links, cancellation, and reloads guard unsaved edits.

New authenticated endpoints:

- `GET /api/v1/moderator/inbox`: `kind`, `q`, `page`, `pageSize`; returns paginated pending submissions with per-kind counts.
- `GET /api/v1/moderator/directory`: `resource=relationships|channels|firms`, `q`, relationship `type`, `status`, `publication`, `page`, `pageSize`; returns paginated summaries.
- `GET /api/v1/moderator/submissions/:id/context`: returns the submission, resolved canonical channel (including historical aliases), and candidate relationship summaries.

Pages default to 25 records, with a maximum of 100. Relationship detail/write and legacy endpoints are retained. Evidence is batch-loaded for profiles and editors; a public graph cache miss uses one joined data query. The public UI loads one complete graph snapshot, filters locally, and preserves node positions. It no longer offers status filters because all public relationships must be confirmed. Server Components read the active workspace section and selected editor/report context. URL navigation requests fresh server-rendered data; there is no client query cache or periodic polling. The public graph refreshes on reload, navigation back to it, or a hidden tab becoming visible. Event-driven refreshes preserve the current graph, expanded firms, dragged positions, and viewport. Simulations pause in hidden tabs. Searchable entity popovers use transient, debounced, abortable same-origin lookups because their results depend on interactive input.

Migration `0004_graph_queue_indexes` adds evidence-claim and submission-queue indexes. It is idempotent and tested against disposable PostgreSQL. Apply migrations with `pnpm db:migrate` before deployment.

Performance measured locally on 2026-11-04, against the same 50-relationship dataset: median of five warm graph requests improved from **1.826 s to 0.569 s (68.9%)**. First observed requests were 5.372 s and 2.226 s respectively; these were not controlled database cold-start measurements. A real-data browser filter completed in approximately 67 ms. These are local observations, not production latency guarantees.


### Public snapshot caching and follow-up timings

`pnpm db:migrate` was run successfully against the configured database on 2026-11-04, and both new indexes were verified in `pg_indexes`.

Fastify owns a process-local published-and-confirmed graph snapshot. Startup begins warming it; `/health` is liveness and `/health/ready` returns 503 until a valid snapshot exists. Configure traffic readiness against the latter. Concurrent cold reads coalesce. After 60 seconds, a request serves the existing snapshot immediately and starts one background refresh. Background failures preserve the snapshot and retry on requests after 60 seconds; failed initial loads retry after five seconds. There are no timers or keepalive jobs.

Successful relationship, channel, firm, claim, evidence, and alias mutations hard-invalidate and rebuild the snapshot before responding, including legacy routes. Generation fencing prevents older reads from repopulating it. A failed rebuild does not turn a committed mutation into an error, but leaves the snapshot unavailable rather than serving pre-edit data. Review decisions never invalidate public data. Filtered legacy requests bypass this cache; the app filters its complete snapshot locally.

`X-Graph-Cache` identifies HIT, MISS, COALESCED, STALE, or BYPASS; `X-Graph-Snapshot-Age` reports whole seconds (zero for bypass reads), and `Server-Timing` reports processing duration. HTTP remains `no-store`. This is a single-process cache with no persistence: restarts need one warmup read. Out-of-band database edits are discovered by request-triggered refresh after 60 seconds, not by a strict maximum-age guarantee. Multiple API instances would require shared invalidation.

The web app runs **Next.js 16.4.5 and React 19.3.1**, the latest stable releases verified on 2026-11-04. Cache Components and Partial Prefetching are enabled, with Turbopack for development and production builds. Node.js 20.9 or newer is required; development and validation use Node 24.

Public profile reads use `use cache`, explicit `cacheLife({ stale: 0, revalidate: 30, expire: 60 })`, and the `public-directory` tag. Graph Server Components read the canonical unfiltered Fastify endpoint, with React `cache` deduplicating only within a render. There is no second persistent graph cache in Next.js. Workspace mutations use Server Actions that forward session cookies and the origin to Fastify. Fastify remains responsible for authorization, shared validation, transactions, and audit records. Successful directory changes call `updateTag(public-directory)` and `revalidatePath` for the workspace. Approval/rejection revalidates the private inbox without expiring public data. Legacy same-origin API writes still expire the public tag with `revalidateTag(tag, { expire: 0 })`. Public cached reads never forward session cookies. TanStack Query has been removed; browser components retain only interaction state and form input.

The homepage prerenders navigation and the graph skeleton, then loads the cached graph at request time with `connection()` inside Suspense. Builds do not require a running API. Private session checks and workspace reads remain uncached, forward the session cookie, and stream under Suspense. Protected segments use `instant = false` because authorization can redirect before a target page renders. Their Suspense shells still stream, and public route navigation remains validated. Signing out performs a full navigation to clear the client router/Activity cache. Runtime URL hooks are isolated behind focused boundaries, and theme-dependent graph styling waits for hydration.

React `cache` deduplicates graph and workspace session reads within a render. Public navigation uses normal partial prefetching; private section navigation continues to load only the active section. The API's process-local cache still serves browser and extension graph requests. Profile caches expire within their configured lifetime; graph freshness belongs to Fastify.

Run `pnpm check` for generated Next route types, workspace type checks, and the browser/API boundary check. Run `pnpm build` for production builds. No refresh interval is installed: an unattended tab makes no periodic graph requests. Returning to the tab calls `router.refresh()` and remains subject to the backend snapshot lifecycle. Version-matched framework guidance is bundled at `apps/web/node_modules/next/dist/docs/`.

Browser tests run against development by default. To verify production streaming, private access, cross-request cache reuse, and tag invalidation:

```sh
API_INTERNAL_URL=http://127.0.0.1:4101 NEXT_DIST_DIR=.next-qa pnpm --filter @yt-equity/web build
PLAYWRIGHT_PRODUCTION=1 pnpm --filter @yt-equity/web test:e2e
```

The test runner starts the isolated fixture API and production web server; it never modifies the configured database or sends email.

Follow-up local measurements, same 50-relationship / 36,834-byte snapshot, median of five subsequent requests:

| Request | After migration, before new cache | After cache and joined read |
| --- | ---: | ---: |
| Direct graph API | 570.1 ms | 3.6 ms (HIT) |
| Same-origin graph proxy | 605.8 ms | 12.1 ms (HIT) |
| Homepage HTML response (development server) | 676.3 ms | 64.6 ms |

A warm uncached graph read now takes 292.2 ms (previously 570.1 ms), approximately 49% faster. The first observed cache miss after API restart was still 2,178.9 ms, including database connection setup; caching does not remove that cost. These are local observations, not controlled Neon cold-start benchmarks or browser interactivity measurements. Index installation alone did not materially change graph latency.

Repeat with `node scripts/benchmark-graph.mjs [apiOrigin] [webOrigin]`; it reports the first observation separately from five subsequent requests, plus cache status and an uncached control. The benchmark performs reads only. `pnpm --filter @yt-equity/api test:relationships` includes cache expiration, concurrent reads, invalidation races, failure recovery, publication, and legacy evidence/archive invalidation checks.

After the Next 16 upgrade, the same read-only benchmark against a local production server measured medians of **2.4 ms** for cached graph API requests, **6.1 ms** for the same-origin proxy, and **12.3 ms** for the complete homepage HTML response (five subsequent requests). The first observed homepage response was **714.9 ms**. Production figures are not directly comparable with the earlier development-server HTML timings and do not measure browser interactivity. Verification passed 17 production browser tests and 35 targeted API/action/cache tests, plus workspace type/boundary checks and production builds.

The Server Component / Server Action flow is verified by 19 production browser tests, including event-driven refresh without polling, preservation of graph state, failed-save recovery, public cache invalidation after archiving, and unauthorized Server Action replay. Workspace type/boundary checks and production builds pass.


### Canvas shell and fluid interaction

The header spans the viewport independently of sidebar expansion. Navigation remains a compact floating rail below it. On graph pages the shell reserves no full-height sidebar column: the canvas extends beneath the rail and bottom-left controls sit 15 px from its left edge. Only the top filters receive horizontal clearance for the rail. Profile and workspace content retain their reading inset, and mobile navigation uses the shadcn Sheet with explicit trigger focus restoration.

React Flow provides zoom, fit-view, and interaction-lock controls. Unlocking never enables connections. Fit view reframes the current positions; the contextual Reset view restores the starting arrangement and camera. Pending initial camera fitting is cancelled when the user starts interacting so it cannot override zoom or dragging. The development indicator is hidden because it otherwise covers the leftmost canvas control; Next still displays compile/runtime error overlays. Standard React Flow attribution is retained.

Verification passed 24 production browser tests, workspace type/boundary checks, and production builds. Local production measurements after the interaction changes (same dataset, Chromium, unthrottled): five filter updates had a median of **28.7 ms** to painted output and made **zero data requests**. Expanding the 20-channel firm took **80.8 ms**, with a **16.7 ms median / 16.8 ms p95 frame interval** over 118 animation frames (approximately 60 fps). The first observed browser graph load after starting the production server took **2,419 ms**; five subsequent loads had a median of **392 ms** to visible graph nodes. Warm shell paint median was **20 ms**. Initial data/connection latency remains separate from interaction performance; these are local measurements, not production network guarantees.

### Backend snapshot first-load follow-up (2026-11-04)

The homepage now reads Fastify's canonical snapshot, removing its former `status=confirmed` bypass and the second persistent Next graph cache. On isolated local production frontend/backend processes with the same 50-relationship / 36,834-byte dataset, a fresh browser visiting a ready backend showed graph nodes in **562 ms** (previously **2,419 ms**, about **77% faster**). Five further fresh browser contexts measured 222, 528, 337, 259, and 359 ms: **337 ms median**. First shell FCP was 396 ms; subsequent median FCP was 68 ms. These are unthrottled local Chromium observations, not network guarantees.

Five warm HTTP requests measured **4.9 ms median** for the cached API, **5.5 ms** through the same-origin proxy, and **16.5 ms** for complete graph HTML. The uncached comparison query measured **288.9 ms median**, with its first observation at 1,934 ms. Backend startup is separate: one observed launch reached liveness at 8.1 seconds and readiness at 12.2 seconds while builds ran; a repeat reached liveness at 10.8 seconds and readiness at 13.2 seconds (2.4 seconds of snapshot warming after liveness) during browser/typecheck work. These include local process/module startup overhead, not a controlled database cold-compute measurement. Traffic should use `/health/ready` before routing visitors.

Browser test ports can be isolated with `PLAYWRIGHT_WEB_PORT` and `PLAYWRIGHT_API_PORT` (defaults 3100 and 4101) to prevent concurrent test runs resetting each other's fixture data.

Snapshot follow-up verification: 20 relationship/cache tests, nine public/live lookup integration tests, and 12 report/action tests passed; workspace type/boundary checks and production builds passed. The isolated production browser suite passed 28 of 29 tests; the remaining camera-stability assertion captured the viewport before the queued initial fit. It now waits for that fit and passed its targeted rerun. Fluid motion, local filters, canvas controls, event-driven refresh, and moderation checks passed against the rebuilt workspace.

### Creator easter egg

After applying migrations, run `pnpm db:seed:creator` to add or update Kamo IO (`@kamoio`) without running the financial relationship seed. Standard `pnpm db:seed` also includes this channel. Its database marker enables “👨🏾‍💻 I built this thing.” on the public profile and extension; it creates no firm, claim, evidence, or ownership-graph connection. Deploy the API and web app and rebuild/reload the extension to show the change. Existing extension lookup caches expire within five minutes; profile caches expire within one minute.
