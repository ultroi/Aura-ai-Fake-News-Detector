FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY .env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "src/server.js"]
