FROM oven/bun:1.1.36-alpine

WORKDIR /app

COPY package.json bun.lockb .

RUN bun i --production

COPY . .

RUN mv .env.deploy .env

EXPOSE 3000

CMD ["bun", "start"]
