import type { Client, ClientEvents } from "discord.js";

import { log } from "#~/helpers/observability";

declare global {
  var __discordListenerRegistry:
    | { event: string; listener: (...args: unknown[]) => void }[]
    | undefined;
}

/**
 * Register a listener with the Discord client and track it for HMR cleanup.
 */
export function registerListener<K extends keyof ClientEvents>(
  client: Client,
  event: K,
  listener: (...args: ClientEvents[K]) => void,
): void {
  globalThis.__discordListenerRegistry ??= [];
  client.on(event, listener);
  globalThis.__discordListenerRegistry.push({
    event,
    listener: listener as (...args: unknown[]) => void,
  });
}

/**
 * Remove all tracked listeners from the client.
 * Call this before rebinding listeners on HMR.
 */
export function removeAllListeners(client: Client): void {
  const registry = globalThis.__discordListenerRegistry ?? [];
  if (registry.length > 0) {
    log(
      "info",
      "ListenerRegistry",
      `Removing ${registry.length} listeners for HMR`,
    );
  }
  for (const { event, listener } of registry) {
    client.off(event, listener);
  }
  globalThis.__discordListenerRegistry = [];
}

/**
 * Get the count of currently registered listeners.
 */
export function getListenerCount(): number {
  return globalThis.__discordListenerRegistry?.length ?? 0;
}
