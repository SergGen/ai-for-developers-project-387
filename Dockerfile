FROM node:26.13.1-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run generate && npm run build && npm prune --omit=dev

FROM node:26.13.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated/openapi.json ./generated/openapi.json
COPY --from=build /app/server ./server

USER node
CMD ["node", "server/index.ts"]
