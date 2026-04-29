# ─────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copy prisma schema + migrations + seed
COPY prisma ./prisma

# Generate client into prisma/generated/client (matches your custom output path)
RUN npx prisma generate

# Copy tsconfig files and nest config
COPY tsconfig*.json nest-cli.json ./

# Copy source
COPY src ./src

# Build NestJS
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Runner
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Skip devDependencies, skip husky
RUN npm ci --omit=dev --ignore-scripts

# Copy prisma folder (migrations + schema + generated client)
# Critical: prisma/generated/client must come from builder, NOT regenerated
# because the .so engine file is platform-specific (linux/amd64)
COPY --from=builder /app/prisma ./prisma

# Copy compiled NestJS output
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
