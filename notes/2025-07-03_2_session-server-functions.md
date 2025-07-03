# Session Server Functions - 2025-07-03

## Key Functions from `#~/models/session.server`

### User Authentication Functions

- **`getUser(request)`** - Returns optional user (undefined if not logged in)
- **`requireUser(request)`** - Returns user or throws error if not logged in
- **`retrieveDiscordToken(request)`** - Gets user's Discord OAuth token from session

### Usage Patterns

```typescript
// For optional user checks (redirects, conditional UI)
const user = await getUser(request);
if (user) {
  throw redirect("/guilds");
}

// For protected routes that require authentication
const user = await requireUser(request);

// For Discord API calls requiring user's token
const userToken = await retrieveDiscordToken(request);
const userRest = new REST({ version: "10" }).setToken(
  userToken.token.access_token,
);
```

### Discord API Integration

- **`fetchGuilds(userRest, botRest)`** requires BOTH tokens:
  - `userRest` - user's OAuth token to get their guilds
  - `botRest` - bot token to get bot's guilds
  - Function compares these to show manageable vs invitable guilds

### Best Practices

- Use `getUser()` for optional checks (landing pages, conditional redirects)
- Use `requireUser()` for protected routes that need authentication
- Always use both user and bot tokens for `fetchGuilds()` function
- Bot token is more reliable for guild operations, but user token needed for user-specific data
