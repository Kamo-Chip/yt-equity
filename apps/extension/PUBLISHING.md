# Publishing YT Equity 1.0.0

The release targets are `https://ytequity.com` and `https://api.ytequity.com`.
The site and API still need to be deployed. ZIP creation does not certify that
those services are reachable. Run the deployment check before store submission.

## Local development

From the repository root:

```sh
cp .env.example .env  # first setup only; keep your existing .env
pnpm install
# Set DATABASE_URL and apply migrations/seed as described in the root README.
pnpm dev
```

`pnpm dev` starts the API on port 4000, web app on port 3000, and an extension
watcher. The watcher builds **both** `apps/extension/dist/chrome` and
`apps/extension/dist/firefox`, using localhost by default. It reads the root
`.env`; `API_PUBLIC_URL` and `WEB_URL` can override these defaults.

For extension work against already-running services, use:

```sh
pnpm --filter @yt-equity/extension dev
```

In Chrome, enable Developer mode at `chrome://extensions`, choose **Load unpacked**,
and select `apps/extension/dist/chrome`. In Firefox 142+, open `about:debugging`,
choose **This Firefox → Load Temporary Add-on**, and select
`apps/extension/dist/firefox/manifest.json`. First installation opens the disclosure.
Choose **Enable ownership lookups** to use the local API. Local filter preferences
are preserved across rebuilds if the browser keeps the same extension installation.

After a rebuild, reload the extension in its browser management page and refresh
open YouTube tabs. The watcher rebuilds files; browsers still require this reload.
For a single build, `build:chrome` and `build:firefox` remain available.

## Verify and package

```sh
pnpm --filter @yt-equity/extension test
pnpm --filter @yt-equity/extension typecheck
pnpm --filter @yt-equity/web exec playwright test test/e2e/extension-release.spec.ts

API_PUBLIC_URL=https://api.ytequity.com WEB_URL=https://ytequity.com \
  pnpm --filter @yt-equity/extension release

pnpm dlx web-ext lint --source-dir apps/extension/dist/firefox --warnings-as-errors
```

`release` requires explicit public HTTPS origins, derives the API host permission,
checks package/manifest version agreement, builds both browsers, and packages only
runtime files with `manifest.json` at the ZIP root. No environment files, channel
snapshot, source tests, or development host grants are included. Outputs:

- `dist/releases/yt-equity-chrome-1.0.0.zip`
- `dist/releases/yt-equity-firefox-1.0.0.zip`
- `dist/releases/SHA256SUMS`
- `dist/releases/release.json` (versions, configured endpoints, and checksums)

`dist/chrome` and `dist/firefox` are scratch build directories; the development
watcher can replace them. The ZIPs are immutable snapshots until you run `release`
again. Stop the watcher before making release packages. Update the package version
and both source manifest versions together for the next release. Keep the Firefox
ID `yt-equity@ytequity.com` unchanged after the first signing.

Firefox uses a background document with `config.js` loaded first; Chrome imports
configuration in a service worker. Firefox 142+ supports the declared data consent
on both relevant platform baselines. This package is listed for desktop only;
Firefox Android is not enabled. Chrome requires version 103+.

## Deploy before uploading

1. Deploy Fastify to `api.ytequity.com` with HTTPS, the production database,
   migrations, and the configuration in the root README. Deploy Next.js to
   `ytequity.com`, including `/privacy` and `/report`.
2. Review the privacy page against the actual host/provider logging configuration.
   Set an operational log retention period and be able to answer access/deletion
   requests through the contact form. Do not enable request-body logging for
   channel lookups. Verify the report inbox is monitored.
3. Run the following; it must pass all four checks:

   ```sh
   API_PUBLIC_URL=https://api.ytequity.com WEB_URL=https://ytequity.com \
     pnpm --filter @yt-equity/extension publish:check
   ```

   It checks API health, the public lookup contract, the actual privacy text, and
   the contact form. Generic hosting/parking pages do not pass the content checks.
4. Install the release build in Chrome and Firefox against live YouTube. Check a
   known acquired channel, a funded channel, an unknown channel, Home/search/
   subscriptions/suggested cards, Reveal, SPA navigation, pause/resume, and an API
   outage. Automated browser checks use YouTube markup fixtures, so live selector
   compatibility must be verified here. Check the support flow without paying.
5. Upload each ZIP to its own store. The Firefox ZIP is submitted for Mozilla
   signing; it is not a signed XPI. Complete store account/contact fields and any
   reviewer instructions. No moderator credentials are needed for the extension.

## Listing text

**Name:** YT Equity

**Short description:** See who owns and funds YouTube channels, with public records and optional feed filters.

**Single purpose:** Show public ownership and funding records for YouTube channels,
with optional filtering of videos from channels with confirmed acquisitions or funding.

**Full description:**

YT Equity brings public ownership and funding records to YouTube. Check channel
information beside a video or on a channel page, and follow links to the full
record and its supporting sources on YT Equity.

Ownership badges appear on supported video lists. You can hide channels with
confirmed acquisitions, confirmed funding, or both, and choose where filtering
applies: Home, search results, suggested videos, and subscriptions. Reveal any
hidden video individually. Hiding is off by default. No published record means
YT Equity has no published finding; it is not a guarantee of independence.

Ownership lookups are enabled by default. Channel handles and IDs from
YouTube pages and video lists are sent to the YT Equity API to retrieve records.
This can reveal channels you browse, even with hiding turned off. The service
receives your IP address. The extension does not send video URLs, search terms,
cookies, or your YouTube account. Preferences stay local. Disable the extension to stop lookups.

The optional support link opens a YouTube video and may open its Super Thanks
chooser. Any amount and payment confirmation remain with you in YouTube.
YT Equity is an independent project and is not affiliated with YouTube or Google.

**Website:** https://ytequity.com/

**Support:** https://ytequity.com/report

**Privacy policy:** https://ytequity.com/privacy

**Category suggestion:** Productivity / Research tools, using the closest category
available in each store.

## Permission and privacy dashboard answers

- `storage`: save lookup consent and filter preferences in the browser profile.
- API host access: POST channel identifiers to `https://api.ytequity.com` for public
  ownership/funding results. No account or authenticated API access is needed.
- YouTube content access: read channel links and add channel controls, ownership
  badges, and optional hide/reveal placeholders on `https://www.youtube.com/*`.
  The support helper runs only on the explicitly marked support-video URL.
- Remote code: none; all executable scripts and styles are packaged. API responses
  are data rendered through DOM/text operations.
- Data categories: disclose browsing activity/history and website content
  (channel IDs/handles read from YouTube). IP addresses and connection metadata
  are visible to the service/providers as described in the privacy policy.
  Do not select “no user data”. No advertising or analytics SDK is included.
- Firefox manifest declarations: required `browsingActivity` and `websiteContent`.
  Firefox asks for the corresponding installation permissions. No additional
  in-extension opt-in is shown.
- Confirm the store certifications for no sale, no unrelated use/transfer, and no
  creditworthiness/lending use only after reviewing the deployed service practices.

## Visual assets and reviewer notes

Packaged icons include 16, 32, 48, and 128-pixel PNGs. The `store-assets` directory
contains 1280×800 product screenshots captured from the actual packaged popup UI
with a presentation background. They show filtering controls and the privacy link, without
inventing ownership records. Inspect these images before uploading; use any
additional promotional image formats required by your chosen store.

Reviewer steps: install; visit YouTube and check channel controls/badges; enable
the desired filters; use Reveal; disable the extension and refresh YouTube to
confirm the annotations disappear. The API must be
online during review. Test results and package checks alone do not establish that
production deployment is complete.
