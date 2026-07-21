# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14-slim AS base
WORKDIR /app
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY docs ./docs
ENV NODE_ENV=production
RUN chown -R bun:bun /app
USER bun
# Cloud Run injects PORT (defaults to 8080) and expects the container to listen on it.
EXPOSE 8080
ENTRYPOINT ["bun", "src/index.ts"]