# Database Structure Analysis - 2025-07-25

## Overview
This codebase uses **Kysely** as the TypeScript query builder with **SQLite** as the database engine. The project follows a clear pattern for database management with migrations, models, and type definitions.

## Key Files and Structure

### Database Configuration
- **`/app/db.server.ts`** - Main database connection using Kysely with SQLite dialect
- **`/kysely.config.ts`** - Migration configuration using kysely-ctl
- **`/app/db.d.ts`** - Auto-generated TypeScript type definitions for all tables

### Models Directory
All database models are in `/app/models/` with `.server.ts` suffix:
- `user.server.ts` - User management functions
- `guilds.server.ts` - Discord guild management
- `activity.server.ts` - Message analytics and statistics
- `session.server.ts` - Session management
- `stripe.server.ts` - Payment integration
- `subscriptions.server.ts` - Subscription management
- `discord.server.ts` - Discord bot specific functions

### Migrations Directory
Located at `/migrations/` with timestamp-prefixed files following pattern `YYYYMMDDHHMMSS_description.ts`

## Database Schema (Current Tables)

Based on `/app/db.d.ts`, current tables are:

1. **users**
   - `id` (uuid, primary key)
   - `email` (text, nullable)
   - `externalId` (text, not null) - Discord user ID
   - `authProvider` (text, defaults to "discord")

2. **sessions**
   - `id` (uuid, primary key)
   - `data` (json)
   - `expires` (datetime)

3. **guilds**
   - `id` (text, primary key) - Discord guild ID
   - `settings` (json) - Guild configuration

4. **message_stats**
   - `author_id` (text)
   - `channel_id` (text)
   - `channel_category` (text, nullable)
   - `guild_id` (text)
   - `message_id` (text, nullable)
   - `recipient_id` (text, nullable)
   - `sent_at` (number) - Unix timestamp
   - `word_count`, `char_count`, `react_count` (numbers)
   - `code_stats`, `link_stats` (json)

5. **channel_info**
   - `id` (text, nullable)
   - `name` (text, nullable)
   - `category` (text, nullable)

6. **tickets_config**
   - `message_id` (text, primary key)
   - `channel_id` (text, nullable)
   - `role_id` (text)

7. **guild_subscriptions**
   - `guild_id` (text, primary key)
   - `stripe_customer_id`, `stripe_subscription_id` (text, nullable)
   - `product_tier` (text, defaults to "free")
   - `status` (text, defaults to "active")
   - `current_period_end` (datetime, nullable)
   - `created_at`, `updated_at` (datetime, auto-generated)

## Patterns to Follow for New Tables

### Migration Pattern
```typescript
import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("table_name")
    .addColumn("id", "uuid", (c) => c.primaryKey().notNull())
    .addColumn("created_at", "datetime", (c) => c.defaultTo("CURRENT_TIMESTAMP"))
    // ... other columns
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("table_name").execute();
}
```

### Model Pattern
```typescript
import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";

export type TableType = DB["table_name"];

export async function getById(id: string) {
  return trackPerformance(
    "getById",
    async () => {
      log("debug", "TableName", "Fetching by ID", { id });
      
      const result = await db
        .selectFrom("table_name")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
        
      log("debug", "TableName", result ? "Found" : "Not found", { id });
      return result;
    },
    { id }
  );
}
```

### Key Patterns
1. **Observability**: All database operations wrapped with `trackPerformance()` and include `log()` calls
2. **Type Safety**: Export table types from models using `DB["table_name"]`
3. **Async/Await**: All database operations are async
4. **Error Handling**: SQLite errors caught and handled appropriately
5. **Naming**: Snake_case for database columns, camelCase for TypeScript
6. **Primary Keys**: UUIDs for user-related tables, natural keys (like Discord IDs) for external entities

## For user_threads Table
Based on patterns, a user_threads table should:
- Use `user_id` (uuid) referencing users.id
- Use `thread_id` (text) as Discord thread ID
- Include `created_at`, `updated_at` timestamps
- Follow the established model pattern with observability
- Have a corresponding migration file with timestamp prefix