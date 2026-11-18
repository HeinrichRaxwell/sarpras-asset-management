# Backend API — Node.js 20 alpine
FROM node:20-alpine

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY --chown=node:node src ./src

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]