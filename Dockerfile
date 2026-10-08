FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 NOVA_STATE_DIR=/data/state NOVA_WORKSPACE_DIR=/data/workspace NOVA_ENABLE_TERMINAL=0
RUN addgroup -S nova && adduser -S nova -G nova && mkdir -p /data/state /data/workspace && chown -R nova:nova /data
COPY --from=builder --chown=nova:nova /app/.next/standalone ./
COPY --from=builder --chown=nova:nova /app/.next/static ./.next/static
COPY --from=builder --chown=nova:nova /app/.worker ./.worker
USER nova
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
