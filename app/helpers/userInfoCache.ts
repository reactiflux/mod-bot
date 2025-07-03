import { LRUCache } from "lru-cache";
import { rest } from "#~/discord/api.js";
import { Routes } from "discord.js";

type DiscordUser = { username: string; global_name: string; id: string };

const cache = new LRUCache<string, DiscordUser>({
  ttl: 1000 * 60 * 60 * 24 * 14, // 14 days
  ttlAutopurge: true,
  max: 150,
});

export async function getOrFetchUser(id: string) {
  if (cache.has(id)) return cache.get(id);

  console.log("Fetching user from Discord API:", id);
  const { username, global_name } = (await rest.get(
    Routes.user(id),
  )) as DiscordUser;
  const result = { username, global_name, id };
  cache.set(id, result);
  return result;
}
