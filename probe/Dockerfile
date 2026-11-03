FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src/check.ts src/types.ts src/
COPY probe/*.ts probe/
EXPOSE 8080
USER node
CMD ["node", "probe/main.ts"]
