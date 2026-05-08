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
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80