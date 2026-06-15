FROM node:24-bookworm-slim AS deps

WORKDIR /app
COPY apps/mobile-next/package.json apps/mobile-next/package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder

ARG BRAINSTY_CONNECTOR_API_BASE=http://fastapi:8000
ENV NEXT_TELEMETRY_DISABLED=1 \
    BRAINSTY_CONNECTOR_API_BASE=${BRAINSTY_CONNECTOR_API_BASE}
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/mobile-next/package.json apps/mobile-next/package-lock.json ./
COPY apps/mobile-next/app ./app
COPY apps/mobile-next/lib ./lib
COPY apps/mobile-next/public ./public
COPY apps/mobile-next/next.config.mjs ./next.config.mjs

RUN npm run build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    BRAINSTY_CONNECTOR_API_BASE=http://fastapi:8000

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
