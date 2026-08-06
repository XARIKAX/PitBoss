# PitBosses keeper image. One image runs any of the four bots; the compose file
# (or `docker run ... pnpm <bot>`) selects which. Runs TypeScript directly via tsx.
FROM node:20-alpine

# pnpm via corepack (pinned in package.json "packageManager").
RUN corepack enable

WORKDIR /app

# Install deps first for layer caching. No lockfile is committed here, so this
# resolves against the ranges in package.json.
COPY package.json ./
RUN pnpm install --prod=false

# App source.
COPY tsconfig.json ./
COPY src ./src

# Default to the read-only aggregator; compose overrides `command` per service.
ENV NODE_ENV=production
CMD ["pnpm", "season-agg"]
