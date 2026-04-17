FROM node:22-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build

ENV NODE_ENV=development

CMD ["node", "apps/query-worker/dist/index.js"]
