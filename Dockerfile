# Multi-stage build: compile the React app, then ship only what the API needs at runtime.
# Express serves the built UI (SERVE_CLIENT defaults to on in production): one container, one port.

# ---- Stage 1: install everything and build the client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build -w client

# ---- Stage 2: runtime image (server production dependencies + built client) ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
# Run as the unprivileged "node" user that the official image provides.
RUN mkdir -p server/uploads && chown -R node:node server/uploads
USER node
EXPOSE 5000
CMD ["node", "server/src/server.js"]
