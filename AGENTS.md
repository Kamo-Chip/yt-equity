# Engineering standards

- Fastify exclusively owns database access, authentication, authorization, validation, business rules, and mutations. Next.js must not import database clients, repositories, or SQL.
- Browser data lookups use the same-origin Next `/api/*` proxy. Workspace mutations use same-origin Server Actions as transport to Fastify. Server rendering and actions explicitly forward the request session cookie for private reads and writes. Extensions use public Fastify endpoints.
- Authentication types are inferred from Better Auth configuration. Roles are server-controlled (`input: false`), permissions are enforced in Fastify, CSRF and origin checks remain enabled, and secrets, cookies, tokens, and magic links are never logged.
- Keep internal and public URLs separate and validate required configuration at startup. Never expose internal URLs through browser environment variables.
- Use shared contracts and typed errors. Distinguish unauthenticated, forbidden, validation, conflict, and service failures.
- Use supported transactions for mutations and audit records. Approval never mutates directory content; claim publication is explicit.
- Reproduce defects before claiming a cause, test the browser/API boundary, and state verification limits.
- Remove superseded flows, update documentation with configuration changes, and preserve unrelated user work.

## Next.js standards

- Use the installed version's docs at `apps/web/node_modules/next/dist/docs/` for Next.js APIs and migration guidance.
- Cache Components and Partial Prefetching are enabled. Cache public profiles with `use cache`, an explicit `cacheLife`, and a cache tag; the graph uses the canonical Fastify snapshot with request-level React deduplication only; never cache session cookies, authorization, or protected workspace data.
- Keep request-time work under a meaningful Suspense boundary. Await `params`, `searchParams`, `headers`, and cookies; do not reintroduce obsolete route segment cache configuration.
- Workspace Server Actions forward mutations to Fastify, use `updateTag` for successful public directory changes, and revalidate the private workspace path. Keep the compatibility API proxy's tag invalidation. Review decisions never invalidate public data.
- Server Components own page data reads. Keep public filtering and graph interaction local; refresh on return/navigation rather than polling. Interactive entity search may use abortable same-origin lookups.
