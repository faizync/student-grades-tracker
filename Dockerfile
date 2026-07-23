# ---- Stage 1: install production dependencies ----
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only the manifests first so this layer is cached and
# npm install is skipped whenever only source files change.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# ---- Stage 2: runtime ----
FROM node:22-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./
COPY public ./public

# Mount point for the PersistentVolume.
# Pre-created and owned by uid 1000 (the built-in "node" user).
RUN mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

# Run as a non-root user
USER node

EXPOSE 8080

CMD ["node", "server.js"]
