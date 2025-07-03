# Discord API Integration

This document explains how Euno interacts with Discord's API and the patterns used throughout the codebase.

## Token Types & Management

### Bot Token

- **Source**: `DISCORD_HASH` environment variable
- **Usage**: Server operations, guild data fetching, bot commands
- **Client**: `rest` from `#~/discord/api.js`
- **Permissions**: Granted when bot is invited to server

```typescript
import { rest } from "#~/discord/api.js";
const guildRoles = await rest.get(Routes.guildRoles(guildId));
```

### User OAuth Token

- **Source**: User session storage via OAuth flow
- **Usage**: User-specific operations, permission checking
- **Scopes**: `"identify email guilds guilds.members.read"` (user) or includes `"bot applications.commands"` (bot install)
- **Client**: Created per-request with user's access token

```typescript
const userToken = await retrieveDiscordToken(request);
const userRest = new REST({ version: "10" }).setToken(
  userToken.token.access_token,
);
const userGuilds = await userRest.get(Routes.userGuilds());
```

## Common API Patterns

### Guild Data Fetching

```typescript
// Get guild roles (excluding @everyone, sorted by hierarchy)
const guildRoles = await rest.get(Routes.guildRoles(guildId));
const roles = guildRoles
  .filter((role) => role.name !== "@everyone")
  .sort((a, b) => b.position - a.position);

// Get text channels only, sorted by position
const guildChannels = await rest.get(Routes.guildChannels(guildId));
const channels = guildChannels
  .filter((channel) => channel.type === 0) // Text channels
  .sort((a, b) => a.position - b.position);
```

### Command Management

```typescript
// Deploy commands to specific guild
await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
  body: commands,
});

// Delete specific command
await rest.delete(
  Routes.applicationGuildCommand(applicationId, guildId, commandId),
);
```

## OAuth Flow

### User Authentication

- **Endpoint**: `/auth/discord`
- **Scopes**: User identification and guild access
- **Storage**: Session-based with database persistence

### Bot Installation

- **Endpoint**: `/auth/discord/bot`
- **Scopes**: Includes bot permissions for server installation
- **Permissions**: Configurable bot permissions for guild operations

### Token Management

- User tokens stored in sessions with automatic refresh
- Bot token configured once via environment variables
- Token validation and refresh handled in `session.server.ts`

## Error Handling

### API Call Patterns

```typescript
try {
  const data = await rest.get(Routes.guild(guildId));
  return data;
} catch (error) {
  console.error("Discord API error:", error);
  // Fall back gracefully or return empty data
  return null;
}
```

### Common Issues

- **403 Forbidden**: Bot lacks permissions in guild
- **404 Not Found**: Guild/channel/role doesn't exist
- **401 Unauthorized**: Token expired or invalid
- **Rate Limiting**: Handled automatically by discord.js REST client

## Client Setup

### Main Bot Client

```typescript
// app/discord/client.server.ts
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    // ... other intents
  ],
});
```

### REST Client

```typescript
// app/discord/api.ts
export const rest = new REST({ version: "10" }).setToken(discordToken);
```

## Dependencies

- `discord.js`: ^14.16.0 - Main Discord library
- `@discordjs/rest`: ^2.4.0 - REST API client
- `discord-api-types`: 0.37.97 - TypeScript types
- `simple-oauth2`: ^5.1.0 - OAuth 2.0 client

## Environment Variables

```bash
DISCORD_APP_ID=976541718109368361
DISCORD_SECRET=your_client_secret
DISCORD_PUBLIC_KEY=your_public_key
DISCORD_HASH=your_bot_token
```

## Best Practices

1. **Use bot token for guild operations** - More reliable than user OAuth tokens
2. **Handle rate limiting** - discord.js REST client handles this automatically
3. **Validate permissions** - Check bot has necessary permissions before API calls
4. **Error gracefully** - Always provide fallbacks when Discord API is unavailable
5. **Filter data appropriately** - Exclude @everyone role, filter channel types, etc.
