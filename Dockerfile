FROM node:20-alpine as build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY vite.config.ts tailwind.config.js kysely.config.ts tsconfig.json .eslint* .prettierignore ./
COPY app ./app

RUN npm run build

# Build the production image with minimal footprint
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules /app/node_modules
ADD package.json package-lock.json ./
RUN npm prune --production

COPY --from=build /app/build ./build

COPY kysely.config.ts ./
COPY migrations ./migrations

CMD ["npm", "run", "start"]
