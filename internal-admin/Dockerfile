# syntax=docker/dockerfile:1
#
# Dockerfile for the internal-admin (admin.crewlly.com) Next.js app.
#
# Build context: the REPO ROOT (not internal-admin/). This is required because
# the admin app shares code with the main crewlly.com app via TypeScript path
# mapping — it imports from ../lib and ../prisma, which only exist relative to
# the repo root.
#
# Example build:
#   docker build -f internal-admin/Dockerfile -t crewlly-internal-admin .

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
# Install root deps (Prisma client, etc.) — we re-use them rather than
# duplicating in the admin app's package.json where possible.
COPY package*.json ./
RUN npm ci
# Install the admin app's own deps (Next.js, Tailwind, etc.) in a separate layer.
COPY internal-admin/package*.json ./internal-admin/
RUN cd internal-admin && npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL=postgresql://app:app@db:5432/app
ENV DATABASE_URL=${DATABASE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/internal-admin/node_modules ./internal-admin/node_modules
# Copy shared sources (lib + prisma schema) and the admin app itself.
COPY lib ./lib
COPY prisma ./prisma
COPY internal-admin ./internal-admin
COPY package*.json ./
# Generate the Prisma client (admin app uses the SAME client as main app).
RUN npx prisma@5.19.1 generate
# Build the admin app.
RUN cd internal-admin && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL=postgresql://app:app@db:5432/app
ENV DATABASE_URL=${DATABASE_URL}
# Copy build artefacts + dependencies in the minimal layout Next.js needs at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/internal-admin/node_modules ./internal-admin/node_modules
COPY --from=builder /app/internal-admin/.next ./internal-admin/.next
COPY --from=builder /app/internal-admin/public ./internal-admin/public
COPY --from=builder /app/internal-admin/package.json ./internal-admin/package.json
COPY --from=builder /app/internal-admin/next.config.mjs ./internal-admin/next.config.mjs
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3002
WORKDIR /app/internal-admin
CMD ["npm", "run", "start"]
