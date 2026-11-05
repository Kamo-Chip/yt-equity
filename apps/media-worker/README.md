# Directory media

The private R2 bucket `yt-equity-media` serves images through https://yt-equity-media.kamokhumalo04.workers.dev. Keep direct bucket access disabled.

Authenticate Wrangler using the OS keyring. Deploy with `pnpm --filter @yt-equity/media-worker deploy`.

Upload or replace an image from the repository root:

```sh
MEDIA_PUBLIC_ORIGIN=https://yt-equity-media.kamokhumalo04.workers.dev \
  node apps/media-worker/upload.mjs channel <YouTube-channel-ID> /path/to/image.jpg
# For a firm, use: firm <firm-UUID> /path/to/logo.png
```

The command verifies image bytes and type, uses a content-hashed path, reuses matching objects, and verifies the public response. Save the returned URL through the moderator editor for an audited Fastify update. Credentials stay outside source control and browser code.

Run `pnpm --filter @yt-equity/media-worker test` for unit tests and `node apps/media-worker/test/live.mjs` for live delivery checks.
