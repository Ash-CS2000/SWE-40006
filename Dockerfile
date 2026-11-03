# Recipe for packaging TaskFlow into a container image.
# Build:  docker build -t taskflow .
# Run:    docker run -p 3000:3000 -e DATABASE_URL=... -e SESSION_SECRET=... taskflow

# Small Linux image with Node.js 22 already installed
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copy only the dependency list first and install. Docker caches this step,
# so rebuilding after a code change skips reinstalling unchanged libraries.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the app code
COPY src ./src
COPY public ./public

# Don't run as root inside the container: the base image includes a "node" user
USER node

EXPOSE 3000

# Docker marks the container unhealthy if /health stops answering
# (that also covers the database being unreachable)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" || exit 1

# Start node directly (not via npm) so it receives the stop signal from Docker
CMD ["node", "src/server.js"]
