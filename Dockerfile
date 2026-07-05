FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

ENV TZ=Asia/Jakarta

CMD ["npx", "tsx", "src/index.ts", "bot"]
