# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

LABEL stage="builder"

WORKDIR /app

# Install deps first (cached unless package.json changes)
COPY package*.json ./
RUN npm ci --prefer-offline --ignore-scripts

COPY . .

ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL
# Disable create-react-app telemetry
ENV DISABLE_ESLINT_PLUGIN=true
ENV CI=false

RUN npm run build \
 && find /app/build -name "*.map" -delete   # strip source maps from prod image

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="IST Frontend" \
      org.opencontainers.image.description="Internet Stability Tracker React UI"

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Run nginx as non-root (nginx image supports this via listen 8080,
# but since we bind :80 here we keep default user — nginx drops privs internally)
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
