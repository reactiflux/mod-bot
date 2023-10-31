import TTLCache from "@isaacs/ttlcache";
import { AuditLogEvent, Collection, Events, Message, User } from "discord.js";
import { Client, GuildAuditLogsEntry, GuildBan, GuildMember } from "discord.js";
import { sleep } from "~/helpers/misc";

import { retry } from "~/helpers/timing";

// const getCacheKeyFromLog = (log: GuildAuditLogsEntry) => {
//   const { targetId, target, executor, executorId, action, changes } = log;

//   if (action === AuditLogEvent.MemberBanAdd && target instanceof User) {
//     return `ban:${targetId}:${executorId}`;
//   }
//   if (action === AuditLogEvent.MemberUpdate) {
//     if (changes.some((x) => x.key === "communication_disabled_until")) {
//       return `timout:${targetId}:${executorId}`;
//     }
//   }
//   // TODO
// };

// const getCacheKeyByAction = (action: Actions) => {
//   if (action instanceof Message) return "msgDelete";
// };

// const logs = new TTLCache<string, GuildAuditLogsEntry>({
//   ttl: 1000 * 10, // 10s
// });

// type Actions = Message | GuildBan | GuildMember;
// const actions = new TTLCache<string, Actions>({
//   ttl: 1000 * 10, // 10s
// });

// const handleAuditLog = async (log: GuildAuditLogsEntry) => {
//   const key = `${log.targetType}:${log.actionType}@${log.createdAt}`;
//   logs.set(key, log);
//   await sleep(250);
//   try {
//     await retry(
//       async () => {
//         // look up actions by known key based on info in audit log
//         // if it doesn't exist, throw
//       },
//       3,
//       500,
//     );
//   } catch (e) {
//     console.log("failed to find action associated with audit log:", log.id);
//     return;
//   }
// };

export const auditLogs = (client: Client) => {
  client.guilds.cache.forEach(async (g) => {
    const logs = await g.fetchAuditLogs();
    console.log("logs:", logs);
  });
  client.on(Events.GuildAuditLogEntryCreate, (auditLogEntry) => {
    console.log("log", auditLogEntry);
    // if (
    //   auditLogEntry.action === AuditLogEvent.MessageDelete &&
    //   auditLogEntry.executorId !== auditLogEntry.targetId
    // ) {
    //   console.log(
    //     auditLogEntry.executor,
    //     "remove a message from",
    //     auditLogEntry.target,
    //   );
    // }
    // handleAuditLog(auditLogEntry);
  });
  // client.on("guildBanAdd", (ban) => {
  //   console.log("unbanning for dev mode https://discord.gg/Faqeb9RV");
  //   // TODO
  //   ban.guild.bans.remove(ban.user);
  // });
  // client.on("guildMemberUpdate", (member) => {
  //   console.log(member);
  // });
  // client.on("guildMemberRemove", (member) => {});
  // client.on("messageDelete", (message) => {});
  // client.on("messageDeleteBulk", (messages) => {});
};
