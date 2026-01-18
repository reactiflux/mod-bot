import type { Client, ClientEvents } from "discord.js";

import { log } from "#~/helpers/observability";

// All HMR-related global state declarations
declare global {
  var __discordListenerRegistry:
    | { event: string; listener: (...args: unknown[]) => void }[]
    | undefined;
  var __discordScheduledTasks: ReturnType<typeof setTimeout>[] | undefined;
  var __discordClientReady: boolean | undefined;
  var __discordLoginStarted: boolean | undefined;
}

// --- Login state ---

export function isLoginStarted(): boolean {
  return globalThis.__discordLoginStarted ?? false;
}

export function markLoginStarted(): void {
  globalThis.__discordLoginStarted = true;
}

// --- Client ready state ---

export function isClientReady(): boolean {
  return globalThis.__discordClientReady ?? false;
}

export function setClientReady(): void {
  globalThis.__discordClientReady = true;
}

// --- Scheduled tasks ---

export function registerScheduledTask(
  timer: ReturnType<typeof setTimeout>,
): void {
  globalThis.__discordScheduledTasks ??= [];
  globalThis.__discordScheduledTasks.push(timer);
}

export function clearScheduledTasks(): void {
  const tasks = globalThis.__discordScheduledTasks ?? [];
  if (tasks.length > 0) {
    log("info", "HMR", `Clearing ${tasks.length} scheduled tasks`);
  }
  for (const timer of tasks) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  globalThis.__discordScheduledTasks = [];
}

// --- Listener registry ---

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
    log("info", "HMR", `Removing ${registry.length} listeners for HMR`);
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
