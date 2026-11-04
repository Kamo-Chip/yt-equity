FROM node:24.19.0-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --prod=false --filter @yt-equity/web...
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY scripts/validate-env.mjs scripts/validate-env.mjs
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @yt-equity/web build && chown -R node:node /app/apps/web/.next
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@yt-equity/web", "start"]
