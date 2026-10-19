# AquaSense IA — imagen de producción (servidor Express + interfaz estática)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/server

# Dependencias primero (aprovecha la caché de capas)
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY public/ /app/public/

# No ejecutar como root
USER node
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["node", "server.js"]
