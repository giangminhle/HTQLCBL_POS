# Shared Dockerfile for the Vite frontends (admin, pos).
# Build context: repository root
#   docker build -f docker/web.Dockerfile --build-arg APP=admin --build-arg VITE_API_URL=http://localhost:3000 .
FROM node:22-bookworm-slim AS build
ARG APP
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/${APP}/package.json apps/${APP}/
RUN pnpm install --frozen-lockfile --filter @retailchain/${APP}...
COPY packages/shared packages/shared
COPY apps/${APP} apps/${APP}
RUN pnpm --filter @retailchain/${APP} build && mv apps/${APP}/dist /out

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html
EXPOSE 80
