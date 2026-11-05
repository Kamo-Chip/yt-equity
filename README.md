# YT Equity

An evidence-backed directory of funding and acquisition relationships across YouTube, with an interactive ownership graph and browser extension. Public records must be explicitly published and confirmed; submissions are reviewed in a private moderator workspace.

## Project structure

- `apps/web` — Next.js directory and moderator workspace
- `apps/api` — Fastify API, authentication, and business logic
- `apps/extension` — Chrome and Firefox extension
- `apps/media-worker` — image delivery from private R2 storage ([setup](apps/media-worker/README.md))
- `packages/db` — Neon/PostgreSQL schema, Drizzle migrations, and seed data
- `packages/contracts` — shared Zod contracts

## Local setup

Use Node.js 24 and pnpm 11.17.0.

```sh
pnpm install
cp .env.example .env
```

Set `DATABASE_URL` to your development database and replace `BETTER_AUTH_SECRET` with a random secret of at least 32 characters. The example URLs already point to localhost. Set the same random `API_PROXY_SECRET` (at least 32 characters) for web and API to authenticate visitor rate-limit identities. On Railway these use the edge’s [X-Real-IP header](https://docs.railway.com/networking/public-networking/specs-and-limits); local development uses an anonymous cookie. Set `RESEND_API_KEY` and `RESEND_FROM` if you need magic-link sign-in.

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

This starts the web app at http://localhost:3000, the API at http://localhost:4000, and the extension watcher for both browsers.

### Load the extension

- **Chrome:** enable Developer mode at `chrome://extensions`, then choose **Load unpacked** and select `apps/extension/dist/chrome`.
- **Firefox 142+:** open `about:debugging` and load `apps/extension/dist/firefox/manifest.json` as a temporary add-on.

After a rebuild, reload the extension and refresh your YouTube tabs.

### Administrator access

Sign in at `/moderator/sign-in`, then promote your account in the development database:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

## Development commands

```sh
pnpm check                                     # Type and browser/API boundary checks
pnpm build                                     # Production builds
pnpm test                                     # All isolated tests and environment checks
pnpm --filter @yt-equity/api test               # Isolated API and migration tests
pnpm --filter @yt-equity/web test               # Graph unit tests and public Server Actions
pnpm --filter @yt-equity/extension test         # Extension tests
pnpm --filter @yt-equity/media-worker test      # Image delivery tests
pnpm --filter @yt-equity/web exec playwright install chromium
pnpm --filter @yt-equity/web test:e2e           # Browser tests with an isolated fixture API
```

Keep isolated tests focused on business rules, security boundaries, and graph math. Browser tests cover user workflows and representative desktop/mobile interactions; avoid repeating timing, direction, or pixel-level variations already covered by unit tests.

Live lookup integration tests require a running seeded development API: `API_TEST_URL=http://localhost:4000 pnpm --filter @yt-equity/api test:integration`. They run separately from the isolated suites.

## Deployment

1. In Railway, use the repository root as the build context for both services: `apps/api/Dockerfile` and `apps/web/Dockerfile`. Service settings and domains are defined in `.railway/railway.ts`; review `railway config plan` before applying infrastructure changes with `railway config apply`.
2. Set production variables in Railway. Set the same persistent random `API_PROXY_SECRET` on both services. The API requires `DATABASE_URL`, `WEB_ORIGIN`, `BETTER_AUTH_URL`, a persistent `BETTER_AUTH_SECRET` of at least 32 characters, `RESEND_API_KEY`, and `RESEND_FROM` using a verified sender. Set both public auth origins to `https://www.ytequity.com`. The web requires the same `WEB_ORIGIN` and `API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`. Keep secrets in Railway and internal URLs server-only.
3. Deploy the API first. Its pre-deploy command runs `pnpm db:migrate`; do not seed production. Wait for `/health/ready` to pass, then deploy the web service and verify `/health`.
4. Verify the public directory, sign-in, and moderator access at `https://www.ytequity.com`. Subsequent application changes deploy from `main` according to the configured watch paths. Roll back to a previous healthy Railway deployment if needed; keep migrations backward compatible because image rollback does not reverse database changes.
