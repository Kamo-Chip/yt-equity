FROM node:24.19.0-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
# tsx and drizzle-kit are needed at runtime and during pre-deploy migrations.
RUN pnpm install --frozen-lockfile --prod=false --filter @yt-equity/api...
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY scripts/validate-env.mjs scripts/validate-env.mjs
RUN pnpm --filter @yt-equity/api build
ENV NODE_ENV=production PORT=4000
USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@yt-equity/api", "start"]
