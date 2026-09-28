FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node sql ./sql

ENV NODE_ENV=production
ENV PORT=4000

USER node

EXPOSE 4000

CMD ["node", "src/server.js"]