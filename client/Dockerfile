# UI image: builds the Vue app, then serves it with nginx, which also proxies /api to the API container.
# Build context is the repository root (npm workspaces share one package-lock.json).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w client
COPY client/ client/
RUN npm run build -w client

FROM nginx:1.27-alpine
COPY client/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
