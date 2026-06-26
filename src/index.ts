import {
  AuditLogEvent,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  GuildTextBasedChannel,
  GuildMember,
  Message,
  MessageReaction,
  PartialMessageReaction,
  Partials
} from "discord.js";
import { handleMessageAutomod } from "./automod.js";
import { CommandSyncMode, syncApplicationCommands } from "./commandSync.js";
import { ConfigStore } from "./config.js";
import { env } from "./env.js";
import { memberDisplayName, sendLog } from "./logging.js";
import { executeModerationAction, moderationPermission, runModerationAction } from "./moderation.js";
import { canManageManagers, isBotManager } from "./permissions.js";
import {
  completeVerification,
  startVerification,
  verificationModal
} from "./verification.js";
import {
  handleJoinSecurity,
  handleRoleGuard,
  watchSensitiveAuditAction
} from "./security.js";
import { GuildConfig, LogChannelKey, ModerationAction, RaidMode } from "./types.js";

const store = new ConfigStore();
await store.load();

const commandPrefix = "'";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction, Partials.User]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Guardian online as ${readyClient.user.tag}`);
});

const logChannelLabels: Record<LogChannelKey, string> = {
  mod: "Moderation actions",
  message: "Message edits/deletes",
  joinLeave: "Join/leave",
  voice: "Voice",
  member: "Member updates",
  server: "Server updates",
  security: "Security",
  onboarding: "Onboarding/server profile",
  permissionActions: "Staff permission actions"
};

const logChannelKeys = Object.keys(logChannelLabels) as LogChannelKey[];

function formatList(title: string, values: string[]): string {
  return [`**${title}**`, ...(values.length ? values.map((value) => `- ${value}`) : ["- None configured."])].join("\n");
}

function mentionChannels(ids: string[]): string[] {
  return ids.map((id) => `<#${id}> (${id})`);
}

function mentionMembers(ids: string[]): string[] {
  return ids.map((id) => `<@${id}> (${id})`);
}

function mentionRoles(ids: string[]): string[] {
  return ids.map((id) => `<@&${id}> (${id})`);
}

function formatReactionRoleEmoji(emoji: string, emojiDisplay: string): string {
  return emojiDisplay === emoji ? emoji : `${emojiDisplay} (${emoji})`;
}

function formatBoolean(value: boolean): string {
  return value ? "Enabled" : "Disabled";
}

function formatCommandSyncResult(result: Awaited<ReturnType<typeof syncApplicationCommands>>): string {
  const messages: string[] = [];
  if (result.syncedScope) {
    messages.push(
      result.syncedScope === "global"
        ? `Synced ${result.syncedCount} global command groups. Discord may take up to an hour to show global command changes.`
        : `Synced ${result.syncedCount} command groups for this server.`
    );
  }
  for (const scope of result.clearedScopes) {
    messages.push(
      scope === "global"
        ? "Cleared global command registrations. Discord may take up to an hour to fully hide global commands."
        : "Cleared command registrations for this server."
    );
  }
  return messages.join("\n") || "No command sync changes were made.";
}

function formatLogChannels(config: GuildConfig): string {
  return formatList(
    "Log Channels",
    logChannelKeys.map((key) => `${logChannelLabels[key]}: ${config.logChannels[key] ? `<#${config.logChannels[key]}> (${config.logChannels[key]})` : "Not configured"}`)
  );
}

function formatGuardianSettings(config: GuildConfig): string {
  return [
    formatList("Managers", mentionMembers(config.managers)),
    formatList("Media Channels", mentionChannels(config.automod.mediaOnlyChannelIds)),
    formatList("PNP Approved Channels", mentionChannels(config.automod.pnpChannelIds)),
    formatList("Regular Nudity-Checked Channels", mentionChannels(config.automod.regularChannelIds)),
    formatList("Ignored Channels", mentionChannels(config.automod.ignoredChannelIds)),
    formatList("Link-Ignored Channels", mentionChannels(config.automod.ignoredLinkChannelIds)),
    formatList("Word-Ignored Channels", mentionChannels(config.automod.ignoredWordChannelIds)),
    formatList("Blocked Links", config.automod.blockedLinks),
    formatList("Blocked Words", config.automod.blockedWords),
    formatList("Immune Members", mentionMembers(config.immuneMemberIds)),
    formatList("Immune Roles", mentionRoles(config.immuneRoleIds)),
    formatList(
      "Reaction Roles",
      config.reactionRoles.map(
        (mapping) =>
          `${formatReactionRoleEmoji(mapping.emoji, mapping.emojiDisplay)} on <#${mapping.channelId}>/${mapping.messageId}: <@&${mapping.roleId}> (${mapping.roleId})`
      )
    ),
    formatLogChannels(config),
    formatList("Verification", [
      `Status: ${formatBoolean(config.verification.enabled)}`,
      `Captcha: ${formatBoolean(config.verification.captchaEnabled)}`,
      `Minimum account age: ${config.verification.minAccountAgeDays} day(s)`,
      `Deny young accounts: ${formatBoolean(config.verification.denyYoungAccounts)}`,
      `Age gate: ${formatBoolean(config.verification.ageGateEnabled)}`,
      `Verified role: ${config.verification.verifiedRoleId ? `<@&${config.verification.verifiedRoleId}> (${config.verification.verifiedRoleId})` : "Not configured"}`,
      `Quarantine role: ${config.verification.quarantineRoleId ? `<@&${config.verification.quarantineRoleId}> (${config.verification.quarantineRoleId})` : "Not configured"}`,
      `Verification channel: ${config.verification.verificationChannelId ? `<#${config.verification.verificationChannelId}> (${config.verification.verificationChannelId})` : "Not configured"}`
    ]),
    formatList("Automod", [
      `Status: ${formatBoolean(config.automod.enabled)}`,
      `Nudity detection: ${formatBoolean(config.automod.nudityDetectionEnabled)}`,
      `Raid mode: ${config.automod.raidMode}`,
      `Max joins per minute: ${config.automod.maxJoinsPerMinute}`,
      `Max moderation actions per minute: ${config.automod.maxModerationActionsPerMinute}`
    ]),
    formatList("Role Guard", [
      `Status: ${formatBoolean(config.roleGuard.enabled)}`,
      `Quarantine repeat offenders: ${formatBoolean(config.roleGuard.quarantineRepeatOffenders)}`,
      `Allowed roles: ${mentionRoles(config.roleGuard.allowedRoleIds).join(", ") || "None configured."}`,
      `Allowed members: ${mentionMembers(config.roleGuard.allowedMemberIds).join(", ") || "None configured."}`,
      `Elevated permissions: ${config.roleGuard.elevatedPermissionNames.join(", ") || "None configured."}`
    ])
  ].join("\n\n");
}

function formatGuardianView(category: string, config: GuildConfig): string {
  if (category === "pnp-channels") return formatList("PNP Approved Channels", mentionChannels(config.automod.pnpChannelIds));
  if (category === "media-channels") return formatList("Media Channels", mentionChannels(config.automod.mediaOnlyChannelIds));
  if (category === "regular-channels") return formatList("Regular Nudity-Checked Channels", mentionChannels(config.automod.regularChannelIds));
  if (category === "ignored-channels") return formatList("Ignored Channels", mentionChannels(config.automod.ignoredChannelIds));
  if (category === "ignored-link-channels") return formatList("Link-Ignored Channels", mentionChannels(config.automod.ignoredLinkChannelIds));
  if (category === "ignored-word-channels") return formatList("Word-Ignored Channels", mentionChannels(config.automod.ignoredWordChannelIds));
  if (category === "managers") return formatList("Guardian Managers", mentionMembers(config.managers));
  if (category === "blocked-links") return formatList("Blocked Links", config.automod.blockedLinks);
  if (category === "blocked-words") return formatList("Blocked Words", config.automod.blockedWords);
  if (category === "immune-members") return formatList("Immune Members", mentionMembers(config.immuneMemberIds));
  if (category === "immune-roles") return formatList("Immune Roles", mentionRoles(config.immuneRoleIds));
  if (category === "log-channels") return formatLogChannels(config);
  if (category === "verification") {
    return formatList("Verification", [
      `Status: ${formatBoolean(config.verification.enabled)}`,
      `Captcha: ${formatBoolean(config.verification.captchaEnabled)}`,
      `Minimum account age: ${config.verification.minAccountAgeDays} day(s)`,
      `Deny young accounts: ${formatBoolean(config.verification.denyYoungAccounts)}`,
      `Age gate: ${formatBoolean(config.verification.ageGateEnabled)}`,
      `Verified role: ${config.verification.verifiedRoleId ? `<@&${config.verification.verifiedRoleId}> (${config.verification.verifiedRoleId})` : "Not configured"}`,
      `Quarantine role: ${config.verification.quarantineRoleId ? `<@&${config.verification.quarantineRoleId}> (${config.verification.quarantineRoleId})` : "Not configured"}`,
      `Verification channel: ${config.verification.verificationChannelId ? `<#${config.verification.verificationChannelId}> (${config.verification.verificationChannelId})` : "Not configured"}`
    ]);
  }
  if (category === "raid-gate") {
    return formatList("Raid Gate", [
      `Raid mode: ${config.automod.raidMode}`,
      `Max joins per minute: ${config.automod.maxJoinsPerMinute}`,
      `Max moderation actions per minute: ${config.automod.maxModerationActionsPerMinute}`
    ]);
  }
  if (category === "role-guard") {
    return formatList("Role Guard", [
      `Status: ${formatBoolean(config.roleGuard.enabled)}`,
      `Quarantine repeat offenders: ${formatBoolean(config.roleGuard.quarantineRepeatOffenders)}`,
      `Allowed roles: ${mentionRoles(config.roleGuard.allowedRoleIds).join(", ") || "None configured."}`,
      `Allowed members: ${mentionMembers(config.roleGuard.allowedMemberIds).join(", ") || "None configured."}`,
      `Elevated permissions: ${config.roleGuard.elevatedPermissionNames.join(", ") || "None configured."}`
    ]);
  }
  if (category === "reaction-roles") {
    return formatList(
      "Reaction Roles",
      config.reactionRoles.map(
        (mapping) =>
          `${formatReactionRoleEmoji(mapping.emoji, mapping.emojiDisplay)} on <#${mapping.channelId}>/${mapping.messageId}: <@&${mapping.roleId}> (${mapping.roleId})`
      )
    );
  }
  return formatGuardianSettings(config);
}

function reactionEmojiKey(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

function reactionEmojiKeyFromInput(input: string): string {
  const trimmed = input.trim();
  const customEmojiMatch = trimmed.match(/^<a?:\w+:(\d+)>$/);
  return customEmojiMatch?.[1] ?? trimmed;
}

async function handleReactionRole(reaction: MessageReaction | PartialMessageReaction, userId: string, adding: boolean): Promise<void> {
  const fullReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  if (!fullReaction?.message.guild) return;

  const key = reactionEmojiKey(fullReaction);
  if (!key) return;

  const mapping = store.getGuild(fullReaction.message.guild.id).reactionRoles.find((entry) => {
    return entry.channelId === fullReaction.message.channelId && entry.messageId === fullReaction.message.id && entry.emoji === key;
  });
  if (!mapping) return;

  const member = await fullReaction.message.guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const role = fullReaction.message.guild.roles.cache.get(mapping.roleId) ?? (await fullReaction.message.guild.roles.fetch(mapping.roleId).catch(() => null));
  if (!role?.editable) return;

  if (adding && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Guardian reaction role").catch(() => undefined);
  }

  if (!adding && member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Guardian reaction role").catch(() => undefined);
  }
}

async function replyWithChunks(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  const chunks: string[] = [];
  let chunk = "";

  for (const line of content.split("\n")) {
    if (chunk.length + line.length + 1 > 1900) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += `${chunk ? "\n" : ""}${line}`;
  }

  if (chunk) chunks.push(chunk);
  await interaction.reply({ content: chunks.shift() ?? "No settings found.", ephemeral: true });
  for (const nextChunk of chunks) {
    await interaction.followUp({ content: nextChunk, ephemeral: true });
  }
}

async function replyToMessageWithChunks(message: Message, content: string): Promise<void> {
  const chunks: string[] = [];
  let chunk = "";

  for (const line of content.split("\n")) {
    if (chunk.length + line.length + 1 > 1900) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += `${chunk ? "\n" : ""}${line}`;
  }

  if (chunk) chunks.push(chunk);
  await message.reply(chunks.shift() ?? "No settings found.");
  for (const nextChunk of chunks) {
    if (message.channel.isSendable()) await message.channel.send(nextChunk);
  }
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    tokens.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["'])/g, "$1"));
  }
  return tokens;
}

function idFromMention(input?: string): string | undefined {
  return input?.match(/^<@!?(\d+)>$|^<@&(\d+)>$|^<#(\d+)>$/)?.slice(1).find(Boolean) ?? input;
}

function parseBoolean(input?: string): boolean | undefined {
  if (!input) return undefined;
  const value = input.toLowerCase();
  if (["true", "yes", "y", "on", "enable", "enabled", "1"].includes(value)) return true;
  if (["false", "no", "n", "off", "disable", "disabled", "0"].includes(value)) return false;
  return undefined;
}

function parseNamedOptions(tokens: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += 2) {
    const key = tokens[i]?.replace(/^--?/, "");
    const value = tokens[i + 1];
    if (key && value !== undefined) options.set(key, value);
  }
  return options;
}

async function resolveMember(message: Message, input?: string): Promise<GuildMember | null> {
  const id = idFromMention(input);
  if (!message.guild || !id) return null;
  return message.guild.members.fetch(id).catch(() => null);
}

async function resolveRole(message: Message, input?: string) {
  const id = idFromMention(input);
  if (!message.guild || !id) return null;
  return message.guild.roles.fetch(id).catch(() => null);
}

async function resolveChannel(message: Message, input?: string): Promise<GuildTextBasedChannel | null> {
  const id = idFromMention(input);
  if (!message.guild || !id) return null;
  const channel = await message.guild.channels.fetch(id).catch(() => null);
  return channel?.isTextBased() ? (channel as GuildTextBasedChannel) : null;
}

async function handlePrefixedModCommand(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !(message.member instanceof GuildMember)) return;
  const action = args.shift() as ModerationAction | undefined;
  const validActions: ModerationAction[] = ["warn", "timeout", "kick", "ban", "quarantine", "servermute", "serverdeafen"];
  if (!action || !validActions.includes(action)) {
    await message.reply(`Usage: ${commandPrefix}mod <${validActions.join("|")}> <member> [minutes] [reason]`);
    return;
  }

  if (!message.member.permissions.has(moderationPermission)) {
    await message.reply("You need Moderate Members permission to use moderation commands.");
    return;
  }

  const target = await resolveMember(message, args.shift());
  let timeoutMinutes: number | undefined;
  if (action === "timeout" && args[0] && /^\d+$/.test(args[0])) {
    timeoutMinutes = Number(args.shift());
  }

  await executeModerationAction(
    store,
    {
      guild: message.guild,
      actor: message.member,
      target,
      reason: args.join(" ") || "No reason provided",
      timeoutMinutes,
      reply: async (content) => {
        await message.reply(content);
      }
    },
    action
  );
}

async function handlePrefixedGuardianCommand(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !(message.member instanceof GuildMember)) return;
  const subcommand = args.shift();
  if (!subcommand) {
    await message.reply(`Usage: ${commandPrefix}guardian <subcommand> ...`);
    return;
  }

  const config = store.getGuild(message.guild.id);
  if (!isBotManager(message.member, config)) {
    await message.reply("Only the server owner or Guardian managers can configure the bot.");
    return;
  }

  if ((subcommand === "manager-add" || subcommand === "manager-remove") && !canManageManagers(message.member)) {
    await message.reply("Only the server owner can add or remove Guardian managers.");
    return;
  }

  if (subcommand === "sync-commands") {
    const scope = (args[0] ?? "guild") as CommandSyncMode;
    const touchesGlobal = scope === "global" || scope === "clear-global" || scope === "guild-clean-global" || scope === "global-clean-guild";
    if (touchesGlobal && !canManageManagers(message.member)) {
      await message.reply("Only the server owner can sync or clear global commands.");
      return;
    }

    const result = await syncApplicationCommands(scope, message.guild.id);
    await message.reply(formatCommandSyncResult(result));
    return;
  }

  if (subcommand === "view") {
    await replyToMessageWithChunks(message, formatGuardianView(args[0] ?? "settings", config));
    return;
  }

  if (subcommand === "set-log") {
    const type = args[0] as LogChannelKey | undefined;
    const channel = await resolveChannel(message, args[1]);
    if (!type || !logChannelKeys.includes(type) || !channel) {
      await message.reply(`Usage: ${commandPrefix}guardian set-log <${logChannelKeys.join("|")}> <channel>`);
      return;
    }
    await store.setLogChannel(message.guild.id, type, channel.id);
    await message.reply("Log channel saved.");
    return;
  }

  if (subcommand === "manager-add" || subcommand === "manager-remove") {
    const member = await resolveMember(message, args[0]);
    if (!member) {
      await message.reply(`Usage: ${commandPrefix}guardian ${subcommand} <member>`);
      return;
    }
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.managers = guildConfig.managers.filter((id) => id !== member.id);
      if (subcommand === "manager-add") guildConfig.managers.push(member.id);
    });
    await message.reply(`Guardian manager ${subcommand === "manager-add" ? "added" : "removed"}.`);
    return;
  }

  if (subcommand === "toggle") {
    const module = args[0];
    const enabled = parseBoolean(args[1]);
    if (!module || enabled === undefined) {
      await message.reply(`Usage: ${commandPrefix}guardian toggle <verification|automod|roleGuard|nudity> <true|false>`);
      return;
    }
    await store.updateGuild(message.guild.id, (guildConfig) => {
      if (module === "verification") guildConfig.verification.enabled = enabled;
      if (module === "automod") guildConfig.automod.enabled = enabled;
      if (module === "roleGuard") guildConfig.roleGuard.enabled = enabled;
      if (module === "nudity") guildConfig.automod.nudityDetectionEnabled = enabled;
    });
    await message.reply(`${module} set to ${enabled}.`);
    return;
  }

  if (subcommand === "verification") {
    const options = parseNamedOptions(args);
    const verifiedRole = await resolveRole(message, options.get("verified-role"));
    const quarantineRole = await resolveRole(message, options.get("quarantine-role"));
    const verificationChannel = await resolveChannel(message, options.get("verification-channel"));
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.verification.verifiedRoleId = verifiedRole?.id ?? guildConfig.verification.verifiedRoleId;
      guildConfig.verification.quarantineRoleId = quarantineRole?.id ?? guildConfig.verification.quarantineRoleId;
      guildConfig.verification.minAccountAgeDays = Number(options.get("min-account-age-days")) || guildConfig.verification.minAccountAgeDays;
      guildConfig.verification.denyYoungAccounts = parseBoolean(options.get("deny-young-accounts")) ?? guildConfig.verification.denyYoungAccounts;
      guildConfig.verification.captchaEnabled = parseBoolean(options.get("captcha-enabled")) ?? guildConfig.verification.captchaEnabled;
      guildConfig.verification.ageGateEnabled = parseBoolean(options.get("age-gate-enabled")) ?? guildConfig.verification.ageGateEnabled;
      guildConfig.verification.verificationChannelId = verificationChannel?.id ?? guildConfig.verification.verificationChannelId;
    });
    await message.reply("Verification settings saved.");
    return;
  }

  if (["media-channel", "pnp-channel", "regular-nudity-channel", "ignore-channel", "ignore-link-channel", "ignore-word-channel"].includes(subcommand)) {
    const channel = await resolveChannel(message, args[0]);
    const enabled = parseBoolean(args[1]);
    if (!channel || enabled === undefined) {
      await message.reply(`Usage: ${commandPrefix}guardian ${subcommand} <channel> <true|false>`);
      return;
    }
    const key =
      subcommand === "media-channel"
        ? "mediaOnlyChannelIds"
        : subcommand === "pnp-channel"
          ? "pnpChannelIds"
          : subcommand === "regular-nudity-channel"
            ? "regularChannelIds"
            : subcommand === "ignore-channel"
              ? "ignoredChannelIds"
              : subcommand === "ignore-link-channel"
                ? "ignoredLinkChannelIds"
                : "ignoredWordChannelIds";
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.automod[key] = guildConfig.automod[key].filter((id) => id !== channel.id);
      if (enabled) guildConfig.automod[key].push(channel.id);
    });
    await message.reply("Channel setting saved.");
    return;
  }

  if (["block-link", "block-word"].includes(subcommand)) {
    const value = args[0];
    const enabled = parseBoolean(args[1]);
    if (!value || enabled === undefined) {
      await message.reply(`Usage: ${commandPrefix}guardian ${subcommand} <value> <true|false>`);
      return;
    }
    const key = subcommand === "block-link" ? "blockedLinks" : "blockedWords";
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.automod[key] = guildConfig.automod[key].filter((entry) => entry.toLowerCase() !== value.toLowerCase());
      if (enabled) guildConfig.automod[key].push(value);
    });
    await message.reply("Automod setting saved.");
    return;
  }

  if (subcommand === "reaction-role-add") {
    const channel = await resolveChannel(message, args[0]);
    const messageId = args[1];
    const emojiDisplay = args[2]?.trim();
    const emoji = emojiDisplay ? reactionEmojiKeyFromInput(emojiDisplay) : undefined;
    const role = await resolveRole(message, args[3]);
    if (!channel || !messageId || !emojiDisplay || !emoji || !role) {
      await message.reply(`Usage: ${commandPrefix}guardian reaction-role-add <channel> <message-id> <emoji> <role>`);
      return;
    }
    if (role.managed || !role.editable) {
      await message.reply("I cannot assign that role. Make sure it is below my highest role and is not managed by an integration.");
      return;
    }

    const targetMessage = await channel.messages.fetch(messageId).catch(() => null);
    if (!targetMessage) {
      await message.reply("I could not find that message in the selected channel.");
      return;
    }
    const reacted = await targetMessage.react(emojiDisplay).then(() => true).catch(() => false);
    if (!reacted) {
      await message.reply("I could not react with that emoji. Use a standard emoji or a custom emoji this bot can access.");
      return;
    }

    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.reactionRoles = guildConfig.reactionRoles.filter(
        (mapping) => !(mapping.channelId === channel.id && mapping.messageId === messageId && mapping.emoji === emoji)
      );
      guildConfig.reactionRoles.push({ channelId: channel.id, messageId, emoji, emojiDisplay, roleId: role.id });
    });
    await message.reply(`Reaction role saved: ${emojiDisplay} on message ${messageId} gives <@&${role.id}>.`);
    return;
  }

  if (subcommand === "reaction-role-remove") {
    const channel = await resolveChannel(message, args[0]);
    const messageId = args[1];
    const emoji = args[2] ? reactionEmojiKeyFromInput(args[2]) : undefined;
    if (!channel || !messageId || !emoji) {
      await message.reply(`Usage: ${commandPrefix}guardian reaction-role-remove <channel> <message-id> <emoji>`);
      return;
    }
    let removed = false;
    await store.updateGuild(message.guild.id, (guildConfig) => {
      const before = guildConfig.reactionRoles.length;
      guildConfig.reactionRoles = guildConfig.reactionRoles.filter(
        (mapping) => !(mapping.channelId === channel.id && mapping.messageId === messageId && mapping.emoji === emoji)
      );
      removed = guildConfig.reactionRoles.length !== before;
    });
    await message.reply(removed ? "Reaction role removed." : "No matching reaction role was configured.");
    return;
  }

  if (subcommand === "immunity") {
    const member = await resolveMember(message, args[0]);
    const enabled = parseBoolean(args[1]);
    if (!member || enabled === undefined) {
      await message.reply(`Usage: ${commandPrefix}guardian immunity <member> <true|false>`);
      return;
    }
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.immuneMemberIds = guildConfig.immuneMemberIds.filter((id) => id !== member.id);
      if (enabled) guildConfig.immuneMemberIds.push(member.id);
    });
    await message.reply("Immunity setting saved.");
    return;
  }

  if (subcommand === "immunity-role") {
    const role = await resolveRole(message, args[0]);
    const enabled = parseBoolean(args[1]);
    if (!role || enabled === undefined) {
      await message.reply(`Usage: ${commandPrefix}guardian immunity-role <role> <true|false>`);
      return;
    }
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.immuneRoleIds = guildConfig.immuneRoleIds.filter((id) => id !== role.id);
      if (enabled) guildConfig.immuneRoleIds.push(role.id);
    });
    await message.reply("Role immunity setting saved.");
    return;
  }

  if (subcommand === "role-guard") {
    const options = parseNamedOptions(args);
    const allowedRole = await resolveRole(message, options.get("allowed-role"));
    const allowedMember = await resolveMember(message, options.get("allowed-member"));
    const allowedEnabled = parseBoolean(options.get("allowed-enabled")) ?? true;
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.roleGuard.quarantineRepeatOffenders =
        parseBoolean(options.get("quarantine-repeat-offenders")) ?? guildConfig.roleGuard.quarantineRepeatOffenders;

      if (allowedRole) {
        guildConfig.roleGuard.allowedRoleIds = guildConfig.roleGuard.allowedRoleIds.filter((id) => id !== allowedRole.id);
        if (allowedEnabled) guildConfig.roleGuard.allowedRoleIds.push(allowedRole.id);
      }

      if (allowedMember) {
        guildConfig.roleGuard.allowedMemberIds = guildConfig.roleGuard.allowedMemberIds.filter((id) => id !== allowedMember.id);
        if (allowedEnabled) guildConfig.roleGuard.allowedMemberIds.push(allowedMember.id);
      }
    });
    await message.reply("Role guard settings saved.");
    return;
  }

  if (subcommand === "raid-gate") {
    const options = parseNamedOptions(args);
    await store.updateGuild(message.guild.id, (guildConfig) => {
      guildConfig.automod.raidMode = (options.get("mode") as RaidMode | undefined) ?? guildConfig.automod.raidMode;
      guildConfig.automod.maxJoinsPerMinute = Number(options.get("max-joins-per-minute")) || guildConfig.automod.maxJoinsPerMinute;
      guildConfig.automod.maxModerationActionsPerMinute =
        Number(options.get("max-actions-per-minute")) || guildConfig.automod.maxModerationActionsPerMinute;
    });
    await message.reply("Raid gate settings saved.");
    return;
  }

  await message.reply(`Unknown Guardian subcommand. Use ${commandPrefix}guardian view settings to check current settings.`);
}

async function handlePrefixedCommand(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content.startsWith(commandPrefix)) return false;
  const tokens = tokenizeCommand(message.content.slice(commandPrefix.length).trim());
  const command = tokens.shift()?.toLowerCase();
  if (!command) return false;

  if (command === "guardian") {
    await handlePrefixedGuardianCommand(message, tokens);
    return true;
  }

  if (command === "mod") {
    await handlePrefixedModCommand(message, tokens);
    return true;
  }

  return false;
}

client.on(Events.GuildMemberAdd, async (member) => {
  await handleJoinSecurity(store, member);
  await startVerification(store, member);
  await sendLog(store, member.guild, "joinLeave", "Member joined", [memberDisplayName(member)]);
});

client.on(Events.GuildMemberRemove, async (member) => {
  await sendLog(store, member.guild, "joinLeave", "Member left", [memberDisplayName(member)]);
});

client.on(Events.MessageCreate, async (message) => {
  await handleMessageAutomod(store, message);
  await handlePrefixedCommand(message);
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  const member = message.author ? await message.guild.members.fetch(message.author.id).catch(() => null) : null;
  await sendLog(store, message.guild, "message", "Message deleted", [
    `Author: ${member ? memberDisplayName(member) : "Unknown"}`,
    `Channel: <#${message.channelId}>`,
    message.content ? `Content: ${message.content.slice(0, 1000)}` : "Content unavailable"
  ]);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  const member = newMessage.author ? await newMessage.guild.members.fetch(newMessage.author.id).catch(() => null) : null;
  await sendLog(store, newMessage.guild, "message", "Message edited", [
    `Author: ${member ? memberDisplayName(member) : "Unknown"}`,
    `Channel: <#${newMessage.channelId}>`,
    `Before: ${oldMessage.content?.slice(0, 900) ?? "unavailable"}`,
    `After: ${newMessage.content?.slice(0, 900) ?? "unavailable"}`
  ]);
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  await handleReactionRole(reaction, user.id, true);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  await handleReactionRole(reaction, user.id, false);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member) return;
  let action = `Voice state changed: mute ${oldState.serverMute} -> ${newState.serverMute}, deaf ${oldState.serverDeaf} -> ${newState.serverDeaf}`;
  if (oldState.channelId !== newState.channelId) {
    if (!oldState.channelId && newState.channelId) action = `Joined VC: <#${newState.channelId}>`;
    else if (oldState.channelId && !newState.channelId) action = `Left VC: <#${oldState.channelId}>`;
    else action = `Moved VC: <#${oldState.channelId}> -> <#${newState.channelId}>`;
  }
  await sendLog(store, member.guild, "voice", "Voice activity", [`Member: ${memberDisplayName(member)}`, action]);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await handleRoleGuard(store, oldMember, newMember);
  await sendLog(store, newMember.guild, "member", "Member updated", [`Member: ${memberDisplayName(newMember)}`]);
});

client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
  const sensitive = new Set<AuditLogEvent>([
    AuditLogEvent.ChannelCreate,
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.RoleCreate,
    AuditLogEvent.RoleDelete,
    AuditLogEvent.MemberBanAdd,
    AuditLogEvent.MemberKick,
    AuditLogEvent.BotAdd,
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.GuildUpdate
  ]);

  if (sensitive.has(entry.action)) {
    const executor = entry.executorId ? await guild.members.fetch(entry.executorId).catch(() => null) : null;
    await sendLog(store, guild, "permissionActions", "Staff/bot action", [
      `Action: ${AuditLogEvent[entry.action] ?? entry.action}`,
      `Executor: ${executor ? memberDisplayName(executor) : "Unknown"}`,
      `Target: ${entry.targetId ?? "unknown"}`
    ]);
    await watchSensitiveAuditAction(store, guild, entry.action, entry.executorId);
  }

  if (entry.action === AuditLogEvent.GuildUpdate) {
    const executor = entry.executorId ? await guild.members.fetch(entry.executorId).catch(() => null) : null;
    await sendLog(store, guild, "onboarding", "Server profile/settings changed", [
      `Executor: ${executor ? memberDisplayName(executor) : "Unknown"}`
    ]);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith("guardian:verify:")) {
    await interaction.showModal(verificationModal(interaction.customId.split(":")[2]));
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("guardian:verify-modal:")) {
    const member = interaction.member instanceof GuildMember ? interaction.member : null;
    if (!member) {
      await interaction.reply({ content: "Verification must be completed in the server.", ephemeral: true });
      return;
    }
    const ok = await completeVerification(store, member, interaction.fields.getTextInputValue("captcha"));
    await interaction.reply({ content: ok ? "Verification complete." : "That captcha was wrong or expired.", ephemeral: true });
    return;
  }

  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  if (!member) return;

  if (interaction.commandName === "mod") {
    await runModerationAction(store, interaction, interaction.options.getSubcommand() as ModerationAction);
    return;
  }

  if (interaction.commandName !== "guardian") return;
  const config = store.getGuild(interaction.guild.id);
  if (!isBotManager(member, config)) {
    await interaction.reply({ content: "Only the server owner or Guardian managers can configure the bot.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if ((subcommand === "manager-add" || subcommand === "manager-remove") && !canManageManagers(member)) {
    await interaction.reply({ content: "Only the server owner can add or remove Guardian managers.", ephemeral: true });
    return;
  }

  if (subcommand === "sync-commands") {
    const scope = (interaction.options.getString("scope") ?? "guild") as CommandSyncMode;
    const touchesGlobal = scope === "global" || scope === "clear-global" || scope === "guild-clean-global" || scope === "global-clean-guild";
    if (touchesGlobal && !canManageManagers(member)) {
      await interaction.reply({ content: "Only the server owner can sync or clear global commands.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await syncApplicationCommands(scope, interaction.guild.id);
    await interaction.editReply(formatCommandSyncResult(result));
    return;
  }

  if (subcommand === "view") {
    await replyWithChunks(interaction, formatGuardianView(interaction.options.getString("category", true), config));
    return;
  }

  if (subcommand === "set-log") {
    await store.setLogChannel(
      interaction.guild.id,
      interaction.options.getString("type", true) as LogChannelKey,
      interaction.options.getChannel("channel", true).id
    );
    await interaction.reply({ content: "Log channel saved.", ephemeral: true });
    return;
  }

  if (subcommand === "manager-add" || subcommand === "manager-remove") {
    const user = interaction.options.getUser("member", true);
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.managers = guildConfig.managers.filter((id) => id !== user.id);
      if (subcommand === "manager-add") guildConfig.managers.push(user.id);
    });
    await interaction.reply({ content: `Guardian manager ${subcommand === "manager-add" ? "added" : "removed"}.`, ephemeral: true });
    return;
  }

  if (subcommand === "toggle") {
    const module = interaction.options.getString("module", true);
    const enabled = interaction.options.getBoolean("enabled", true);
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      if (module === "verification") guildConfig.verification.enabled = enabled;
      if (module === "automod") guildConfig.automod.enabled = enabled;
      if (module === "roleGuard") guildConfig.roleGuard.enabled = enabled;
      if (module === "nudity") guildConfig.automod.nudityDetectionEnabled = enabled;
    });
    await interaction.reply({ content: `${module} set to ${enabled}.`, ephemeral: true });
    return;
  }

  if (subcommand === "verification") {
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.verification.verifiedRoleId = interaction.options.getRole("verified-role")?.id ?? guildConfig.verification.verifiedRoleId;
      guildConfig.verification.quarantineRoleId = interaction.options.getRole("quarantine-role")?.id ?? guildConfig.verification.quarantineRoleId;
      guildConfig.verification.minAccountAgeDays = interaction.options.getInteger("min-account-age-days") ?? guildConfig.verification.minAccountAgeDays;
      guildConfig.verification.denyYoungAccounts = interaction.options.getBoolean("deny-young-accounts") ?? guildConfig.verification.denyYoungAccounts;
      guildConfig.verification.captchaEnabled = interaction.options.getBoolean("captcha-enabled") ?? guildConfig.verification.captchaEnabled;
      guildConfig.verification.ageGateEnabled = interaction.options.getBoolean("age-gate-enabled") ?? guildConfig.verification.ageGateEnabled;
      guildConfig.verification.verificationChannelId =
        interaction.options.getChannel("verification-channel")?.id ?? guildConfig.verification.verificationChannelId;
    });
    await interaction.reply({ content: "Verification settings saved.", ephemeral: true });
    return;
  }

  if (["media-channel", "pnp-channel", "regular-nudity-channel", "ignore-channel", "ignore-link-channel", "ignore-word-channel"].includes(subcommand)) {
    const channelId = interaction.options.getChannel("channel", true).id;
    const enabled = interaction.options.getBoolean("enabled", true);
    const key =
      subcommand === "media-channel"
        ? "mediaOnlyChannelIds"
        : subcommand === "pnp-channel"
          ? "pnpChannelIds"
          : subcommand === "regular-nudity-channel"
            ? "regularChannelIds"
            : subcommand === "ignore-channel"
              ? "ignoredChannelIds"
              : subcommand === "ignore-link-channel"
                ? "ignoredLinkChannelIds"
                : "ignoredWordChannelIds";
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.automod[key] = guildConfig.automod[key].filter((id) => id !== channelId);
      if (enabled) guildConfig.automod[key].push(channelId);
    });
    await interaction.reply({ content: "Channel setting saved.", ephemeral: true });
    return;
  }

  if (["block-link", "block-word"].includes(subcommand)) {
    const value = interaction.options.getString("value", true);
    const enabled = interaction.options.getBoolean("enabled", true);
    const key = subcommand === "block-link" ? "blockedLinks" : "blockedWords";
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.automod[key] = guildConfig.automod[key].filter((entry) => entry.toLowerCase() !== value.toLowerCase());
      if (enabled) guildConfig.automod[key].push(value);
    });
    await interaction.reply({ content: "Automod setting saved.", ephemeral: true });
    return;
  }

  if (subcommand === "reaction-role-add") {
    const channel = interaction.options.getChannel("channel", true);
    const messageId = interaction.options.getString("message-id", true);
    const emojiDisplay = interaction.options.getString("emoji", true).trim();
    const emoji = reactionEmojiKeyFromInput(emojiDisplay);
    const selectedRole = interaction.options.getRole("role", true);
    const role = await interaction.guild.roles.fetch(selectedRole.id).catch(() => null);

    if (!("messages" in channel)) {
      await interaction.reply({ content: "Reaction roles must use a text channel.", ephemeral: true });
      return;
    }

    if (!role) {
      await interaction.reply({ content: "I could not find that role.", ephemeral: true });
      return;
    }

    if (role.managed || !role.editable) {
      await interaction.reply({
        content: "I cannot assign that role. Make sure it is below my highest role and is not managed by an integration.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const message = await (channel as GuildTextBasedChannel).messages.fetch(messageId).catch(() => null);
    if (!message) {
      await interaction.editReply("I could not find that message in the selected channel.");
      return;
    }

    const reacted = await message.react(emojiDisplay).then(() => true).catch(() => false);
    if (!reacted) {
      await interaction.editReply("I could not react with that emoji. Use a standard emoji or a custom emoji this bot can access.");
      return;
    }

    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.reactionRoles = guildConfig.reactionRoles.filter(
        (mapping) => !(mapping.channelId === channel.id && mapping.messageId === messageId && mapping.emoji === emoji)
      );
      guildConfig.reactionRoles.push({
        channelId: channel.id,
        messageId,
        emoji,
        emojiDisplay,
        roleId: role.id
      });
    });

    await interaction.editReply(`Reaction role saved: ${emojiDisplay} on message ${messageId} gives <@&${role.id}>.`);
    return;
  }

  if (subcommand === "reaction-role-remove") {
    const channel = interaction.options.getChannel("channel", true);
    const messageId = interaction.options.getString("message-id", true);
    const emoji = reactionEmojiKeyFromInput(interaction.options.getString("emoji", true));
    let removed = false;

    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      const before = guildConfig.reactionRoles.length;
      guildConfig.reactionRoles = guildConfig.reactionRoles.filter(
        (mapping) => !(mapping.channelId === channel.id && mapping.messageId === messageId && mapping.emoji === emoji)
      );
      removed = guildConfig.reactionRoles.length !== before;
    });

    await interaction.reply({ content: removed ? "Reaction role removed." : "No matching reaction role was configured.", ephemeral: true });
    return;
  }

  if (subcommand === "immunity") {
    const user = interaction.options.getUser("member", true);
    const enabled = interaction.options.getBoolean("enabled", true);
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.immuneMemberIds = guildConfig.immuneMemberIds.filter((id) => id !== user.id);
      if (enabled) guildConfig.immuneMemberIds.push(user.id);
    });
    await interaction.reply({ content: "Immunity setting saved.", ephemeral: true });
    return;
  }

  if (subcommand === "immunity-role") {
    const role = interaction.options.getRole("role", true);
    const enabled = interaction.options.getBoolean("enabled", true);
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.immuneRoleIds = guildConfig.immuneRoleIds.filter((id) => id !== role.id);
      if (enabled) guildConfig.immuneRoleIds.push(role.id);
    });
    await interaction.reply({ content: "Role immunity setting saved.", ephemeral: true });
    return;
  }

  if (subcommand === "role-guard") {
    const allowedRole = interaction.options.getRole("allowed-role");
    const allowedMember = interaction.options.getUser("allowed-member");
    const allowedEnabled = interaction.options.getBoolean("allowed-enabled") ?? true;
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.roleGuard.quarantineRepeatOffenders =
        interaction.options.getBoolean("quarantine-repeat-offenders") ?? guildConfig.roleGuard.quarantineRepeatOffenders;

      if (allowedRole) {
        guildConfig.roleGuard.allowedRoleIds = guildConfig.roleGuard.allowedRoleIds.filter((id) => id !== allowedRole.id);
        if (allowedEnabled) guildConfig.roleGuard.allowedRoleIds.push(allowedRole.id);
      }

      if (allowedMember) {
        guildConfig.roleGuard.allowedMemberIds = guildConfig.roleGuard.allowedMemberIds.filter((id) => id !== allowedMember.id);
        if (allowedEnabled) guildConfig.roleGuard.allowedMemberIds.push(allowedMember.id);
      }
    });
    await interaction.reply({ content: "Role guard settings saved.", ephemeral: true });
    return;
  }

  if (subcommand === "raid-gate") {
    await store.updateGuild(interaction.guild.id, (guildConfig) => {
      guildConfig.automod.raidMode = (interaction.options.getString("mode") as RaidMode | null) ?? guildConfig.automod.raidMode;
      guildConfig.automod.maxJoinsPerMinute =
        interaction.options.getInteger("max-joins-per-minute") ?? guildConfig.automod.maxJoinsPerMinute;
      guildConfig.automod.maxModerationActionsPerMinute =
        interaction.options.getInteger("max-actions-per-minute") ?? guildConfig.automod.maxModerationActionsPerMinute;
    });
    await interaction.reply({ content: "Raid gate settings saved.", ephemeral: true });
  }
});

await client.login(env.DISCORD_TOKEN);
