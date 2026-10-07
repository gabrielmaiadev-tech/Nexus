FROM node:22-alpine

WORKDIR /app

COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api/ ./

EXPOSE 3000

CMD ["npm", "run", "start:dev"]