# Multi-stage production container image for DeployHub
FROM node:20-alpine AS builder

WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

FROM node:20-alpine

# Install Docker CLI, Git, and Kubectl
RUN apk add --no-cache curl git docker-cli openssl bash \
    && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl

WORKDIR /app

# Copy installed production dependencies
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy backend and frontend source files
COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_DIR=/app/frontend

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]

