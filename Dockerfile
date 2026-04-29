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
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Production runner
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy generated prisma client and schema (needed for migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy entrypoint
COPY scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
