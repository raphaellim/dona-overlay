FROM node:22-bookworm

WORKDIR /app

ENV NODE_ENV=production

ARG BUILD_ID=20261001_1205
RUN echo "BUILD_ID=$BUILD_ID"

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# 최신 server.js가 이미지에 실제 포함됐는지 빌드 단계에서 확인
RUN echo "=== OAUTH ROUTE CHECK ===" \
    && grep -n "youtube-chat-service/oauth-info" server.js \
    && echo "=== SERVER FILE OK ==="

CMD ["npm", "start"]
