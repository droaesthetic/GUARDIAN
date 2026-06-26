import {
  AuditLogEvent,
  EmbedBuilder,
  Guild,
  GuildAuditLogsEntry,
  GuildMember,
  GuildTextBasedChannel,
  PartialGuildMember,
  TextBasedChannel
} from "discord.js";
import { ConfigStore } from "./config.js";
import { LogChannelKey } from "./types.js";

export function memberDisplayName(member: GuildMember | PartialGuildMember): string {
  return member.displayName;
}

export async function sendLog(
  store: ConfigStore,
  guild: Guild,
  key: LogChannelKey,
  title: string,
  lines: string[]
): Promise<void> {
  const channelId = store.getGuild(guild.id).logChannels[key];
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.filter(Boolean).join("\n").slice(0, 4000))
    .setTimestamp()
    .setColor(0x2f80ed);

  await (channel as GuildTextBasedChannel).send({ embeds: [embed] }).catch(() => undefined);
}

export async function safeReply(channel: TextBasedChannel, content: string): Promise<void> {
  if (!("send" in channel)) return;
  await channel.send({ content, allowedMentions: { parse: [] } }).catch(() => undefined);
}

export async function latestAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string
): Promise<GuildAuditLogsEntry | undefined> {
  const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
  const now = Date.now();
  return logs?.entries.find((entry) => {
    const recent = now - entry.createdTimestamp < 10_000;
    const targetMatches = !targetId || entry.targetId === targetId;
    return recent && targetMatches;
  });
}
