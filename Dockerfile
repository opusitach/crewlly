# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL=postgresql://app:app@db:5432/app
ENV DATABASE_URL=${DATABASE_URL}
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client pinned to Prisma 5 (no DB connection needed)
RUN npx prisma@5.19.1 generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG DATABASE_URL=postgresql://app:app@db:5432/app
ENV DATABASE_URL=${DATABASE_URL}
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
# Database migrations are executed by a dedicated one-shot service in docker-compose.
CMD ["npm", "run", "start"]
