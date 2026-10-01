FROM node:22-bookworm

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY package*.json ./

RUN npm install --omit=dev
RUN npx playwright install --with-deps chromium

COPY . .

CMD ["npm", "start"]
