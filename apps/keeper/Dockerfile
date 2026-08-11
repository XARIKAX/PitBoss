# PitBosses keeper image. One image runs any of the four bots; the compose file
# (or the platform's start command, e.g. `pnpm fulfill`) selects which. Runs
# TypeScript directly via tsx.
FROM node:20-alpine

WORKDIR /app

# pnpm installed directly from the registry — NOT via corepack. Corepack has to
# fetch pnpm at build time and its bundled signature keys go stale on base
# images, failing image builds (Railway et al) with opaque errors.
RUN npm install -g pnpm@9.6.0 --no-audit --no-fund

# Install deps first for layer caching. No lockfile is committed here, so this
# resolves against the ranges in package.json.
COPY package.json ./
RUN pnpm install --prod=false

# App source.
COPY tsconfig.json ./
COPY src ./src

# Run every bot by default, so a single-service deploy gets full upkeep. Narrow
# it with KEEPER_BOTS (e.g. KEEPER_BOTS=fulfill) to run one bot per service.
ENV NODE_ENV=production
CMD ["pnpm", "all"]
