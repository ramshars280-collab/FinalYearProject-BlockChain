# Multi-stage Dockerfile for SOET VeriTrust Next.js Application
# Stage 1: Dependency resolution and native compilation
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Install native build tools required for compiling better-sqlite3 C++ bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Application Build
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next

# Build Next.js production bundle
RUN npm run build

# Remove development dependencies to keep production image lean
RUN npm prune --production

# Stage 3: Minimal Production Runtime
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_DIST_DIR=.next
ENV DATABASE_PATH=/app/data/veritrust.db

# Create non-root system user and group for hardened container security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Create persistent data mount point with non-root ownership
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy production build outputs and pruned dependencies
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./next.config.js

# Declare persistent volume mount point for SQLite database
VOLUME ["/app/data"]

# Switch to non-root user
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["npm", "start"]

