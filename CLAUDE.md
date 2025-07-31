## Memory Management Guidelines

- You expect to be able to access an IDE. If you can't, prompt me about it.
- Write your thoughts in `/notes`, especially if it will help you remember important implementation details later.
- Your notes must be named consistently with a date prefix in the format `YYYY-MM-DD_X_title.md` where X is a monotonically increasing integer.
- This project uses sqlite, so you can inspect the database yourself. You can make your own dummy data, but don't do anything destructive, and make sure to describe how to reverse any DB changes.
- Prefer using Playwright over curl.
- When possible, avoid storing boolean values. Bitfields as flags are preferable to booleans in all situations, bitfields and flags.
- Always use React Query in client apps.

## Project Overview

This is a Discord moderation bot (Euno bot) built with:

- Node.js with TypeScript
- React Router v7 (formerly Remix)
- Kysely ORM with SQLite3
- Discord.js
- Tailwind CSS
- Deployed on DigitalOcean Kubernetes

## Available Developer Commands

### Core Development

- `npm run dev` - Start development environment (migrates DB, seeds data, runs CSS watch + bot)
- `npm run dev-client` - Start web client development (migrates DB, seeds data, runs CSS watch + web server)
- `npm start` - Production start (migrate + start bot)

### Testing & Quality

- `npm test` - Run Vitest tests (34 tests pass across 6 files)
- `npm run validate` - Run tests, linting, and type checking in parallel ✅
- `npm run lint` - ESLint with caching ✅
- `npm run typecheck` - React Router typegen + TypeScript build ✅
- `npm run format` - Prettier formatting

### Building

- `npm run build` - Full production build (CSS + React Router app) ✅
  - Includes build warnings about unused Discord.js imports
  - Generates ~118KB server bundle, ~437KB client bundle

### Database Management

- `npm run start:migrate` - Run database migrations
- `npm run kysely migrate:list` - List migration status (13 migrations, all applied) ✅
- `npm run kysely:seed` - Seed database with test data
- `npm run generate:db-types` - Generate TypeScript types from DB schema

### CSS/Styling

- `npm run generate:css` - Generate Tailwind CSS
- `npm run dev:css` - Watch mode for CSS generation

## Setup Requirements

1. Discord bot configuration (App ID, Public Key, Bot Token)
2. Environment variables in `.env` (copy from `.env.example`)
3. `npm install && npm run dev`
4. Database file: `mod-bot.sqlite3` (121MB, actively used)

## Known Issues Found

- ✅ **Fixed**: `better-sqlite3` needed rebuild for current Node version (resolved with `npm rebuild better-sqlite3`)
- Minor: Kysely/KyselyCTL updates available (v0.28.3 and v0.14.0)
- Minor: Unused Discord.js imports in several files

## Database Status

- SQLite database with 13 applied migrations
- Tables include: guilds, message_stats, user_threads, reported_messages, guild_subscriptions, etc.
