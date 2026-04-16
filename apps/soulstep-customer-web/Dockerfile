# --- Build stage ---
FROM node:20-slim AS builder

WORKDIR /app

# NEXT_PUBLIC_* vars are baked in at build time — accept them as build args
ARG NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=$NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID

COPY package.json package-lock.json* ./
RUN npm install -g npm@11 && npm ci

COPY . .

RUN npm run build

# --- Serve stage ---
# next build --output standalone produces .next/standalone — a self-contained
# Node.js server that doesn't require the full node_modules tree at runtime.
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Copy only what the standalone server needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/ || exit 1

CMD ["node", "server.js"]
