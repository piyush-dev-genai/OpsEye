FROM node:22-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build

ENV NODE_ENV=development

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
