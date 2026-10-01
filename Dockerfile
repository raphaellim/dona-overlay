FROM node:22-bookworm

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY . .

RUN npm install --omit=dev

RUN npx playwright install --with-deps chromium

# Playwright가 local-browsers를 찾더라도 /ms-playwright를 보도록 연결
RUN rm -rf /app/node_modules/playwright-core/.local-browsers \
    && ln -s /ms-playwright /app/node_modules/playwright-core/.local-browsers \
    && ls -la /app/node_modules/playwright-core/.local-browsers \
    && ls -la /ms-playwright

CMD ["npm", "start"]
