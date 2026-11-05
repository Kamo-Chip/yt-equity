# Directory media

The private R2 bucket `yt-equity-media` serves images through https://yt-equity-media.kamokhumalo04.workers.dev. Keep direct bucket access disabled.

Authenticate Wrangler using the OS keyring. Deploy with `pnpm --filter @yt-equity/media-worker run deploy`.

Upload or replace an image from the repository root:

```sh
MEDIA_PUBLIC_ORIGIN=https://yt-equity-media.kamokhumalo04.workers.dev \
  node apps/media-worker/upload.mjs channel <YouTube-channel-ID> /path/to/image.jpg
# For a firm, use: firm <firm-UUID> /path/to/logo.png
```

The command verifies image bytes and type, uses a content-hashed path, reuses matching objects, and verifies the public response. Save the returned URL through the moderator editor for an audited Fastify update. Credentials stay outside source control and browser code.

Run `pnpm --filter @yt-equity/media-worker test` for unit tests and `node apps/media-worker/test/live.mjs` for live delivery checks.

Admins and moderators can use **Upload image** in the channel or firm editor, then save the record. Browser uploads accept JPG, PNG and WebP up to 5 MB; Fastify validates and converts them to WebP (at most 1024 × 1024) before storage. Uploading alone does not change directory records.

For browser uploads, set `MEDIA_PUBLIC_ORIGIN` and `MEDIA_UPLOAD_SECRET` on the API. Configure the same random secret (at least 32 characters) on the Worker using `pnpm exec wrangler secret put MEDIA_UPLOAD_SECRET` from this directory, then deploy the Worker and API/web changes. Only Fastify sends this credential; the browser uses its workspace session. Keep this secret outside source control.
