# The KanTV backend. Build from the repository root:
#   docker build -f packages/backend/Dockerfile -t kantv-backend .
# Runs on any container host (Fly.io, Render, Cloud Run, a VM); configuration and secrets come from the
# environment, see packages/backend/src/server.ts and docs/deploy.md.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/backend/package.json packages/backend/
COPY apps/mobile/package.json apps/mobile/
# A build behind a TLS-inspecting proxy can pass its CA as the "ca" build secret; normal builds skip it.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --workspace @kantv/backend --omit=dev --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY packages/core packages/core
COPY packages/backend packages/backend
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "packages/backend/src/server.ts"]
