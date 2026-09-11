FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src/check.ts src/types.ts src/
COPY probe/main.ts probe/
USER node
CMD ["node", "probe/main.ts"]
