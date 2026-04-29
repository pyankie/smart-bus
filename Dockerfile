# ─────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

# argon2 and other native modules need build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install all dependencies (including devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json && npx tsc-alias -p tsconfig.build.json

# ── Prisma 6 CJS compatibility fix ──────────
# Prisma 6's "prisma-client" generator emits .ts files that:
#   1. Keep ".ts" extensions in imports (require("./internal/class.ts"))
#   2. Use ESM-only `import.meta.url` for __dirname calculation
# Both break at runtime in a CJS/Node 20 context.
# Fix: rewrite .ts → .js in require paths, and replace import.meta.url
# with the CJS __filename equivalent.
RUN find dist/prisma/generated -name '*.js' -exec sed -i \
      -e 's/require("\(.*\)\.ts")/require("\1.js")/g' \
      -e "s/require('\(.*\)\.ts')/require('\1.js')/g" \
      -e 's|(0, node_url_1\.fileURLToPath)(import\.meta\.url)|__filename|g' \
      -e 's|fileURLToPath(import\.meta\.url)|__filename|g' \
      {} +

RUN test -f dist/src/main.js

# ─────────────────────────────────────────────
# Stage 2: Production runner
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy prisma schema + migrations (needed for migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Re-generate Prisma client against production node_modules
# (ensures the correct native engine binary for linux-musl)
RUN npx prisma generate

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy entrypoint
COPY scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
