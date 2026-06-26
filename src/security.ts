import {
  AuditLogEvent,
  Guild,
  GuildMember,
  PartialGuildMember,
  Role
} from "discord.js";
import { ConfigStore } from "./config.js";
import { latestAuditEntry, memberDisplayName, sendLog } from "./logging.js";
import {
  canGrantElevatedRoles,
  botCanModerate,
  isImmune,
  roleHasElevatedPermissions
} from "./permissions.js";

const joinBuckets = new Map<string, number[]>();
const actionBuckets = new Map<string, number[]>();
const botNukeActionBuckets = new Map<string, number[]>();
const roleGuardStrikes = new Map<string, number>();

const botKickActions = new Set<AuditLogEvent>([
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberBanAdd
]);

function record(bucket: Map<string, number[]>, key: string, windowMs: number): number {
  const now = Date.now();
  const values = (bucket.get(key) ?? []).filter((time) => now - time < windowMs);
  values.push(now);
  bucket.set(key, values);
  return values.length;
}

export async function handleJoinSecurity(store: ConfigStore, member: GuildMember): Promise<void> {
  const config = store.getGuild(member.guild.id);
  if (config.automod.raidMode === "off") return;

  const joins = record(joinBuckets, member.guild.id, 60_000);
  if (joins < config.automod.maxJoinsPerMinute) return;

  await sendLog(store, member.guild, "security", "Possible raid detected", [
    `${joins} members joined in the last minute.`,
    `Raid mode: ${config.automod.raidMode}.`
  ]);

  if (config.automod.raidMode === "lockdown" && config.verification.quarantineRoleId && !member.user.bot) {
    await member.roles.add(config.verification.quarantineRoleId, "Raid lockdown").catch(() => undefined);
  }
}

export async function handleRoleGuard(
  store: ConfigStore,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): Promise<void> {
  const config = store.getGuild(newMember.guild.id);
  if (!config.roleGuard.enabled) return;

  const oldRoleIds = new Set(oldMember.roles.cache.map((role) => role.id));
  const addedRoles = newMember.roles.cache.filter((role) => !oldRoleIds.has(role.id));
  const elevatedRoles = addedRoles.filter((role) => roleHasElevatedPermissions(role as Role, config));
  if (elevatedRoles.size === 0) return;

  const entry = await latestAuditEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
  const executorId = entry?.executorId;
  if (!executorId) return;

  const executor = await newMember.guild.members.fetch(executorId).catch(() => null);
  if (!executor || isImmune(executor, config) || canGrantElevatedRoles(executor, config)) return;

  for (const role of elevatedRoles.values()) {
    await newMember.roles.remove(role.id, `Guardian blocked elevated role grant by ${executor.user.tag}`).catch(() => undefined);
  }

  const strikeKey = `${newMember.guild.id}:${executor.id}`;
  const strikes = (roleGuardStrikes.get(strikeKey) ?? 0) + 1;
  roleGuardStrikes.set(strikeKey, strikes);

  await executor.send(`Guardian blocked you from assigning elevated roles in ${newMember.guild.name}.`).catch(() => undefined);
  await sendLog(store, newMember.guild, "security", "Elevated role grant blocked", [
    `Executor: ${memberDisplayName(executor)}`,
    `Target: ${memberDisplayName(newMember)}`,
    `Roles: ${elevatedRoles.map((role) => role.name).join(", ")}`,
    `Strikes: ${strikes}`
  ]);

  if (config.roleGuard.quarantineRepeatOffenders && strikes >= 2 && config.verification.quarantineRoleId) {
    await executor.roles.add(config.verification.quarantineRoleId, "Repeated elevated role grant attempts").catch(() => undefined);
  }
}

export async function watchSensitiveAuditAction(
  store: ConfigStore,
  guild: Guild,
  action: AuditLogEvent,
  executorId?: string | null
): Promise<void> {
  const config = store.getGuild(guild.id);
  if (!executorId) return;
  const count = record(actionBuckets, `${guild.id}:${executorId}`, 60_000);
  const actionName = AuditLogEvent[action] ?? String(action);
  const member = await guild.members.fetch(executorId).catch(() => null);

  if (member?.user.bot && botKickActions.has(action)) {
    const botNukeCount = record(botNukeActionBuckets, `${guild.id}:${executorId}`, 60_000);
    if (botNukeCount >= config.automod.maxModerationActionsPerMinute) {
      const guardian = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      const canKickBot = guardian && member.id !== guardian.id && botCanModerate(member, guardian);
      await sendLog(store, guild, "security", "Bot nuke activity detected", [
        `Bot: ${memberDisplayName(member)}`,
        `Recent destructive actions: ${botNukeCount}`,
        `Latest action: ${actionName}`,
        canKickBot ? "Response: kicked bot." : "Response: could not kick bot due to role hierarchy or missing permissions."
      ]);
      if (canKickBot) {
        await member.kick("Guardian detected mass destructive moderation actions by bot").catch(() => undefined);
      }
    }
  }

  if (count < config.automod.maxModerationActionsPerMinute) return;

  await sendLog(store, guild, "security", "Possible server nuke activity", [
    `Executor: ${member ? memberDisplayName(member) : "Unknown"}`,
    `Recent sensitive actions: ${count}`,
    `Latest action: ${actionName}`
  ]);

  if (config.automod.raidMode === "lockdown" && config.verification.quarantineRoleId) {
    if (member && !isImmune(member, config)) {
      await member.roles.add(config.verification.quarantineRoleId, "Possible server nuke activity").catch(() => undefined);
    }
  }
}
