FROM node:16-alpine

WORKDIR /app
EXPOSE 3000

COPY . /app
RUN yarn -prod
CMD node index.js