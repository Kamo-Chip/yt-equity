<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Application patterns

- Server Components own page reads. Browser lookups use the same-origin `/api/*` proxy; workspace Server Actions transport mutations to Fastify. Forward session cookies explicitly for private server reads and writes. Extensions use public Fastify endpoints.
- Cache Components and Partial Prefetching are enabled. Await `params`, `searchParams`, `headers`, and cookies; place request-time work under meaningful Suspense boundaries. Avoid obsolete route segment cache configuration.
- Cache public profiles with `use cache`, explicit `cacheLife`, and a cache tag. Read the canonical Fastify graph snapshot with React request deduplication only. Never cache sessions, authorization, or private workspace data.
- Successful public directory mutations use `updateTag` and revalidate the private workspace path. Preserve compatibility proxy invalidation; review decisions do not invalidate public data.
- Keep filtering and graph interactions local. Refresh on return/navigation rather than polling; use abortable same-origin requests for interactive entity search.
