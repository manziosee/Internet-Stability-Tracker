# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .

# When served through nginx proxy, /api is resolved relative to the same host
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.25-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
