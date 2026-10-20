# =====================================================================
#  Murojaat boti — ishlab chiqarish uchun konteyner
# =====================================================================
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 uchun qurilish vositalari (faqat build bosqichida)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# Ma'lumotlar doimiy jildda (volume) saqlanadi
RUN mkdir -p /data && chown -R node:node /data /app
ENV DATA_DIR=/data
# Konteyner ichida barcha interfeyslarda tinglaymiz; tashqariga faqat
# docker-compose'dagi 127.0.0.1:8080 bog'lanishi chiqadi.
ENV HOST=0.0.0.0
VOLUME ["/data"]
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
