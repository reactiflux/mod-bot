import { LRUCache } from "lru-cache";
import { rest } from "#~/discord/api.js";
import { Routes } from "discord.js";
import fs from "node:fs/promises";

type DiscordUser = { username: string; global_name: string; id: string };

const cache = new LRUCache<string, DiscordUser>({
  ttl: 1000 * 60 * 60 * 24 * 14, // 14 days
  ttlAutopurge: true,
  max: 150,
});

const cachefile = "./userInfoCache.json";
load();

export async function getOrFetchUser(id: string) {
  if (cache.has(id)) return cache.get(id);

  // @ts-expect-error FIXME: are there types available? schema validation?
  const { username, global_name } = await rest.get(Routes.user(id));
  const result = { id, username, global_name } as DiscordUser;
  cache.set(id, result);
  console.log("Fetched user from Discord API:", id);
  dump();
  return result;
}

export function dump() {
  return fs.writeFile(cachefile, JSON.stringify(cache.dump()), "utf8");
}

export async function load() {
  try {
    const raw = await fs.readFile(cachefile, "utf8");
    cache.load(JSON.parse(raw));
  } catch {
    // ignore errors, file might not exist yet
  }
}
