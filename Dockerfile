# Repo-root keeper image — lets platforms that build from the repo root
# (no root-directory setting) still produce a working keeper container.
# Mirrors apps/keeper/Dockerfile with monorepo COPY paths.
FROM node:20-alpine

WORKDIR /app

# pnpm direct from the registry — corepack's bundled signature keys go stale
# on base images and fail platform builds with opaque errors.
RUN npm install -g pnpm@9.6.0 --no-audit --no-fund

COPY apps/keeper/package.json ./
RUN pnpm install --prod=false

COPY apps/keeper/tsconfig.json ./
COPY apps/keeper/src ./src

ENV NODE_ENV=production
CMD ["pnpm", "season-agg"]
