FROM node:24-alpine AS build
WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm install

COPY vite.config.ts tailwind.config.js kysely.config.ts tsconfig.json .eslint* .prettierignore ./
COPY app ./app

RUN npm run build

# Build the production image with minimal footprint
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules /app/node_modules
ADD package.json package-lock.json ./
RUN npm prune --production

COPY --from=build /app/build ./build
ADD index.prod.js ./

COPY scripts ./scripts
COPY kysely.config.ts ./
COPY migrations ./migrations

CMD ["npm", "run", "start"]
