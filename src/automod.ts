import { Message } from "discord.js";
import { ConfigStore } from "./config.js";
import { memberDisplayName, sendLog } from "./logging.js";
import { checkImageForNudity } from "./nudityProvider.js";
import { isImmune } from "./permissions.js";

function hasAttachmentOrEmbed(message: Message): boolean {
  return message.attachments.some((attachment) => {
    const type = attachment.contentType ?? "";
    return type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/");
  }) || message.embeds.length > 0;
}

function containsBlockedValue(content: string, values: string[]): string | undefined {
  const normalized = content.toLowerCase();
  return values.find((value) => value.trim() && normalized.includes(value.toLowerCase()));
}

export async function handleMessageAutomod(store: ConfigStore, message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const config = store.getGuild(message.guild.id);
  if (!config.automod.enabled || isImmune(member, config)) return;
  if (config.automod.ignoredChannelIds.includes(message.channelId)) return;

  if (config.automod.mediaOnlyChannelIds.includes(message.channelId) && !hasAttachmentOrEmbed(message)) {
    await message.delete().catch(() => undefined);
    await sendLog(store, message.guild, "message", "Media-only message removed", [
      `Author: ${memberDisplayName(member)}`,
      `Channel: <#${message.channelId}>`
    ]);
    return;
  }

  const blockedLink = config.automod.ignoredLinkChannelIds.includes(message.channelId)
    ? undefined
    : containsBlockedValue(message.content, config.automod.blockedLinks);
  const blockedWord = config.automod.ignoredWordChannelIds.includes(message.channelId)
    ? undefined
    : containsBlockedValue(message.content, config.automod.blockedWords);
  if (blockedLink || blockedWord) {
    await message.delete().catch(() => undefined);
    await member.send(`Your message in ${message.guild.name} was removed for a blocked ${blockedLink ? "link" : "word"}.`).catch(() => undefined);
    await sendLog(store, message.guild, "message", "Automod message removed", [
      `Author: ${memberDisplayName(member)}`,
      `Channel: <#${message.channelId}>`,
      `Matched: ${blockedLink ?? blockedWord}`
    ]);
    return;
  }

  if (!config.automod.nudityDetectionEnabled) return;
  if (config.automod.pnpChannelIds.includes(message.channelId)) return;
  if (config.automod.regularChannelIds.length > 0 && !config.automod.regularChannelIds.includes(message.channelId)) return;

  for (const attachment of message.attachments.values()) {
    if (!(attachment.contentType ?? "").startsWith("image/")) continue;
    const result = await checkImageForNudity(attachment.url);
    if (!result.unsafe) continue;

    await message.delete().catch(() => undefined);
    await store.addWarning({
      guildId: message.guild.id,
      userId: message.author.id,
      moderatorId: message.client.user.id,
      reason: `Nudity detected${result.reason ? `: ${result.reason}` : ""}`,
      createdAt: new Date().toISOString()
    });
    await member.send(`Your image in ${message.guild.name} was removed because nudity is not allowed in that channel.`).catch(() => undefined);
    await sendLog(store, message.guild, "message", "Nudity removed", [
      `Author: ${memberDisplayName(member)}`,
      `Channel: <#${message.channelId}>`,
      `Reason: ${result.reason ?? "provider flagged image"}`
    ]);
    return;
  }
}
