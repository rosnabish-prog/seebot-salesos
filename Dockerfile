FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund
COPY . .
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_API_URL="" NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://localhost/build_only npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=production-dependencies --chown=node:node /app /app
RUN mkdir -p /var/lib/salesos/contracts /var/lib/salesos/invoices /var/lib/salesos/credits /var/lib/salesos/logos && chown -R node:node /var/lib/salesos
USER node
EXPOSE 3000 4000
CMD ["node", "apps/api/dist/main.js"]
