# Railway production deployment

The GoDaddy setup uses `https://www.ytequity.com` as the canonical website. GoDaddy permanently redirects `https://ytequity.com` to it. The API is `https://api.ytequity.com`. GoDaddy remains both registrar and DNS host. The existing Neon database is retained.

## Services and images

One Railway project (`yt-equity`), production environment, two services (`api`, `web`). Both build from the Git repository root, using `apps/api/Dockerfile` and `apps/web/Dockerfile`. Do not set the source root to an individual app: both require shared workspace packages.

Images pin Node 24.19.0 and pnpm 11.17.0 and use frozen installs. The API runs TypeScript through tsx because workspace packages export source and the API's TypeScript build performs checks without emitting JavaScript. Keep tsx and drizzle-kit installed in its image. The web runs a production Next server on `0.0.0.0:$PORT`.

`.railway/railway.ts` owns service settings and domains. New Railway services reject legacy railway.json configuration. Variables remain unmanaged by IaC: set them in Railway, never commit secrets. The selected US East region is near the existing Neon database in AWS us-east-2. Each service has one replica and sleeping disabled. The API graph cache needs shared invalidation before horizontal scaling.

```sh
pnpm install --frozen-lockfile
railway link --project f12347b5-ca4b-4401-9b74-7fceaa117065 --environment production
railway config plan
railway config apply --yes
```

Review the plan before applying; it must retain both services and their domains. Infrastructure changes require an explicit plan/apply; application pushes use the configured service watch paths. Extension-only edits do not redeploy either app.

## Production variables

API service:

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=<existing Neon connection URL with SSL>
WEB_ORIGIN=https://www.ytequity.com
BETTER_AUTH_URL=https://www.ytequity.com
BETTER_AUTH_SECRET=<persistent random secret of at least 32 characters>
RESEND_API_KEY=<production sending key>
RESEND_FROM=YT Equity <hello@mail.ytequity.com>
```

Web service:

```dotenv
NODE_ENV=production
PORT=3000
WEB_ORIGIN=https://www.ytequity.com
API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
```

Production start commands validate required variables before opening a port. Public origins must use HTTPS; Better Auth must match the canonical web origin. The API secret remains stable across deploys and rollback. Verify the sender in Resend; its existing mail subdomain MX, SPF and DKIM records must remain intact. A send-only key cannot list Resend domains; this is expected.

Browser requests use `/api/*` on the website; server rendering/actions use the private API address. Never expose the private address via NEXT_PUBLIC variables. Auth verification and session cookies stay on the www host through the website proxy. Missing email credentials cause an error; no magic links or auth query strings are logged.

## GoDaddy DNS

Create Railway custom domains first and use the live values from `railway domain status`, since targets and verification tokens can change if a domain is recreated.

| Type | Name | Value |
| --- | --- | --- |
| CNAME | api | 47bpn3yp.up.railway.app |
| CNAME | www | ujymupsw.up.railway.app |
| TXT | _railway-verify.api | Railway's API domain verification token |
| TXT | _railway-verify.www | Railway's www domain verification token |

Under GoDaddy **Forwarding**, set the domain destination to `https://www.ytequity.com`, Permanent (301), without masking. This replaces the Website Builder apex destination. Preserve existing email and verification records. Do not copy Railway's currently resolved IPs into static A records. GoDaddy provisions HTTPS for forwarding; Railway provisions HTTPS for www and api. Both may require DNS/certificate propagation time. Test a direct path/query at the apex as well as the homepage before sharing links.

## Release, verification and rollback

1. Commit and push the complete application migration and deployment files. Exclude local .env, node_modules, build results, test reports and unrelated todo notes.
2. Deploy the API first. Its pre-deploy step is `pnpm db:migrate` with a 300-second timeout. Failed migrations block deployment. Never automatically seed production.
3. Railway checks `/health/ready` for up to 300 seconds; it returns 503 until the initial public graph snapshot is available. `/health` is API liveness only.
4. Deploy web after API readiness succeeds. Its independent `/health` route does not query the database. Connect both services to this repository's main branch once initial verification passes.
5. Verify graph, profiles, privacy/report pages, secure magic-link authentication, role protection, sign-out and moderator cache invalidation on the production host. Use a reversible existing record edit for a live moderation check; do not publish test claims.

Local checks (fixtures do not use Neon or send email):

```sh
node --test scripts/validate-env.test.mjs
pnpm check
pnpm --filter @yt-equity/api test
pnpm --filter @yt-equity/api test:relationships
pnpm --filter @yt-equity/api test:reports
docker build -f apps/api/Dockerfile -t yt-equity-api:railway .
docker build -f apps/web/Dockerfile -t yt-equity-web:railway .
API_INTERNAL_URL=http://127.0.0.1:4121 NEXT_DIST_DIR=.next-qa pnpm --filter @yt-equity/web build
PLAYWRIGHT_PRODUCTION=1 PLAYWRIGHT_WEB_PORT=3120 PLAYWRIGHT_API_PORT=4121 CI=1 pnpm --filter @yt-equity/web test:e2e
API_PUBLIC_URL=https://api.ytequity.com WEB_URL=https://www.ytequity.com pnpm --filter @yt-equity/extension publish:check
```

GitHub Actions' Production uptime workflow checks both public health URLs every five minutes and can be dispatched manually. GitHub may delay scheduled runs; failed-workflow notifications depend on the repository owner's GitHub notification settings. Railway health checks gate deployment and are not continuous monitoring.

Use Railway's deployment rollback to restore the previous healthy application image. Keep migrations backward compatible because rolling back an image does not roll back the database. The first release has no earlier healthy image; preserve each successful release for subsequent rollback. Browser-store extension publishing is separate.

## Verification on 2026-11-04

Both production Docker images built successfully on Railway, API migrations and readiness passed, and both services became healthy. The custom www/API domains have valid HTTPS. Both services are connected to `Kamo-Chip/yt-equity`, branch `main`. Production variables are stored on Railway and the authentication secret is persistent.

Workspace type/boundary checks, four startup-validation tests, 23 relationship/cache tests, 13 report/action tests, ten API integration tests against production, all four extension publishing preflight checks, and the first external uptime workflow run passed. An isolated container with an unavailable database returned 200 for liveness and 503 for readiness.

Real email sign-in and administrator/moderator access were verified on the www domain. The running production authentication configuration uses Secure, HttpOnly, SameSite=Lax, host-only session cookies. Saving an existing relationship without changing its content succeeded through the web Server Action; publication remained confirmed/published and the API rebuilt its graph snapshot. Evidence identifiers were regenerated by the existing evidence-replacement behavior. Sign-out cleared access and navigating to the administrator route redirected to sign-in.

The full isolated production browser suite passed 123 of 132 tests. Rerunning the nine failures without the simultaneous Docker builds passed five more. Four failures remain: packaged-extension consent/annotation/filtering, immediate layout/reduced-motion transitions, header alignment, and firm-throw inertia. These results do not establish a fully passing browser suite; no changes to those interactions were included in the deployment work.

GoDaddy's apex forwarding is saved and the homepage returns 301 to `https://www.ytequity.com`. Deep apex paths returned 404 during verification; use canonical `https://www.ytequity.com/...` links for profiles, privacy, reports and authentication. The www site serves those routes successfully. Old DNS caches may continue to show Website Builder until their previous TTL expires.
