# HMR Listener Registry Pattern

## Problem

The `globalThis.__discordGatewayInitialized` flag prevents duplicate logins during HMR, but it also prevents listener code from being updated. When files change:

1. Old listeners with stale closures remain active
2. New code never binds because `init()` returns early
3. Changes to listener logic require full restart

## Solution

Listener registry pattern separating "login once" from "bind listeners":

### Core Components

**listenerRegistry.ts**

- `registerListener(client, event, handler)` - wraps `client.on()` and tracks the listener
- `removeAllListeners(client)` - removes all tracked listeners before rebinding
- Uses `globalThis.__discordListenerRegistry` to persist across module reloads

**client.server.ts additions**

- `isClientReady()` / `setClientReady()` - track ClientReady state across HMR
- `registerScheduledTask(timer)` / `clearScheduledTasks()` - track timers for cleanup

**gateway.ts refactor**

```
init() {
  // Login only happens once
  if (!globalThis.__discordLoginStarted) {
    login();
    client.once(ClientReady, setClientReady);
  }

  // Cleanup + rebind every HMR
  removeAllListeners(client);
  clearScheduledTasks();
  bindListeners();

  // Init sub-modules if ready, else wait
  if (isClientReady()) {
    initializeSubModules();
  } else {
    client.once(ClientReady, initializeSubModules);
  }
}
```

### Updated Modules

All modules now use `registerListener` instead of `client.on`:

- automod.ts
- modActionLogger.ts
- activityTracker.ts
- honeypotTracker.ts
- reactjiChanneler.ts
- onboardGuild.ts
- deployCommands.server.ts
- escalationResolver.ts (also registers its timer)

## Tradeoffs

**Pros:**

- Listener code updates on HMR without restart
- No duplicate event handling from stale listeners
- Scheduled tasks properly cleared

**Cons:**

- Slight overhead from listener tracking
- `Events.Raw` isn't in `ClientEvents` type, needs manual tracking
- Sub-module init runs on every HMR (should be idempotent anyway)

## Verification

1. `npm run dev`
2. Edit a listener (e.g., add log in automod.ts)
3. Save → see "Removing N listeners for HMR" in console
4. Trigger event → see new log statement
5. No duplicate handling
