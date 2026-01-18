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
