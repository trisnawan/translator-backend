# ---------- build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first so the layer is cached between builds.
COPY package.json package-lock.json ./
RUN npm ci

# Compile the application.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Drop the dev dependencies from the final node_modules.
RUN npm prune --omit=dev

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV ENABLE_HTTP=true
ENV ENABLE_WORKER=true

WORKDIR /app

# tini reaps the zombie processes and forwards the signals to node.
RUN apk add --no-cache tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# The application does not need to write anything on disk.
USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]

# `docker run <image>` starts the API, override the command to start a worker:
#   command: ["node", "dist/worker.js"]
# or to run the migrations:
#   command: ["npx", "typeorm", "migration:run", "-d", "dist/database/data-source.js"]
CMD ["node", "dist/main.js"]
