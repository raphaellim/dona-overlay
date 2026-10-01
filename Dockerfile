FROM node:22-bookworm

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY package*.json ./
COPY . .

RUN npm install --omit=dev

RUN npx playwright install-deps chromium

CMD ["sh", "-c", "echo PLAYWRIGHT=$(npx playwright --version) && npx playwright install chromium && npm start"]
