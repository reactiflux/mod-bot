# HMR State Consolidation

## Context

Continuing from 2026-01-17_1_hmr-listener-registry.md - HMR globals were scattered across 3 files making the pattern hard to follow.

## Changes

Renamed `listenerRegistry.ts` → `hmrRegistry.ts` and consolidated all HMR state:

### Before (3 files)

- `client.server.ts`: `__discordClientReady`, `__discordScheduledTasks`
- `gateway.ts`: `__discordLoginStarted`
- `listenerRegistry.ts`: `__discordListenerRegistry`

### After (1 file: hmrRegistry.ts)

All globals + their accessor functions:

- `isLoginStarted()` / `markLoginStarted()`
- `isClientReady()` / `setClientReady()`
- `registerScheduledTask()` / `clearScheduledTasks()`
- `registerListener()` / `removeAllListeners()` / `getListenerCount()`

## client.server.ts

Now only contains:

- Client instantiation (intents, partials)
- Reacord wrapper
- `login()` function

## Files Updated

- 8 files updated to import from `hmrRegistry` instead of `listenerRegistry`
- `escalationResolver.ts` now imports `registerScheduledTask` from `hmrRegistry`
- `gateway.ts` now uses `isLoginStarted()`/`markLoginStarted()` helpers

## Log Tags

Changed "ListenerRegistry" → "HMR" for consistency.

---

## Monkeypatch for Transparent HMR Tracking

### Problem

Required explicit `registerListener()` calls instead of native `client.on()`. Easy to accidentally use `client.on()` directly and break HMR.

### Solution

Monkeypatch `client.on` immediately after client creation in `client.server.ts`:

```typescript
const originalOn = client.on.bind(client);
client.on = ((event: string, listener: (...args: unknown[]) => void) => {
  globalThis.__discordListenerRegistry ??= [];
  globalThis.__discordListenerRegistry.push({ event, listener });
  return originalOn(event, listener);
}) as typeof client.on;
```

### Changes

1. **client.server.ts**: Added global declarations + monkeypatch after client creation
2. **hmrRegistry.ts**: Removed `registerListener()` and `getListenerCount()`, kept `removeAllListeners()` + other helpers
3. **9 files**: Reverted from `registerListener(client, event, handler)` to `client.on(event, handler)`

### Why not patch `once()`?

`client.once()` is used for one-time initialization (e.g., `Events.ClientReady`). These handlers auto-remove after firing and shouldn't be tracked for HMR removal.
