# Node 24: node:sqlite (DatabaseSync) is available without --experimental-sqlite.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Builds sharp's platform-specific binaries for the image platform, not the dev machine.
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.mjs ./
COPY lib ./lib
COPY providers ./providers
COPY public ./public

# Runtime write targets. In-cluster each of these is a PVC subPath mount; the mkdir
# keeps the image runnable standalone and fixes ownership for the unprivileged user.
RUN mkdir -p data runs logs source-originals && chown -R node:node /app

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
