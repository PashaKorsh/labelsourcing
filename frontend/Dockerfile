# build stage
FROM node:20 AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

ARG VITE_API_MODE

ENV VITE_API_MODE=$VITE_API_MODE

RUN npm run build

# serve stage
FROM node:20-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/dist .
EXPOSE 3000
CMD ["serve", "-s", ".", "-l", "3000"]