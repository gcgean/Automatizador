FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY web ./web
COPY shared ./shared
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY logo-command-comercial.jpg ./
COPY --from=build /app/dist ./dist
RUN mkdir -p server/data && chown node:node /app/server/data
USER node
EXPOSE 3333
CMD ["node", "server/index.js"]
