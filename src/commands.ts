import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder
} from "discord.js";
import { LogChannelKey, ModerationAction, RaidMode } from "./types.js";

const logChoices: { name: string; value: LogChannelKey }[] = [
  { name: "Moderation actions", value: "mod" },
  { name: "Message edits/deletes", value: "message" },
  { name: "Join/leave", value: "joinLeave" },
  { name: "Voice", value: "voice" },
  { name: "Member updates", value: "member" },
  { name: "Server updates", value: "server" },
  { name: "Security", value: "security" },
  { name: "Onboarding/server profile", value: "onboarding" },
  { name: "Staff permission actions", value: "permissionActions" }
];

const moderationActions: ModerationAction[] = [
  "warn",
  "timeout",
  "kick",
  "ban",
  "quarantine",
  "servermute",
  "serverdeafen"
];

const raidModeChoices: { name: string; value: RaidMode }[] = [
  { name: "Off", value: "off" },
  { name: "Watch only", value: "watch" },
  { name: "Lockdown", value: "lockdown" }
];

function moderationSubcommand(action: ModerationAction): SlashCommandSubcommandBuilder {
  const builder = new SlashCommandSubcommandBuilder()
    .setName(action)
    .setDescription(`${action} a member`)
    .addUserOption((option) => option.setName("member").setDescription("Member").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(500));

  if (action === "timeout") {
    builder.addIntegerOption((option) =>
      option.setName("minutes").setDescription("Timeout length in minutes").setMinValue(1).setMaxValue(40320)
    );
  }

  return builder;
}

export const commands = [
  new SlashCommandBuilder()
    .setName("guardian")
    .setDescription("Configure Guardian")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-log")
        .setDescription("Set one of Guardian's log channels")
        .addStringOption((option) =>
          option.setName("type").setDescription("Log type").setRequired(true).addChoices(...logChoices)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("manager-add")
        .setDescription("Owner only: let a member manage Guardian settings")
        .addUserOption((option) => option.setName("member").setDescription("Member").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("manager-remove")
        .setDescription("Owner only: remove a Guardian manager")
        .addUserOption((option) => option.setName("member").setDescription("Member").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Toggle a Guardian module")
        .addStringOption((option) =>
          option
            .setName("module")
            .setDescription("Module")
            .setRequired(true)
            .addChoices(
              { name: "Verification", value: "verification" },
              { name: "Automod", value: "automod" },
              { name: "Role guard", value: "roleGuard" },
              { name: "Nudity detection", value: "nudity" }
            )
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enabled").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View Guardian configuration")
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Configuration to view")
            .setRequired(true)
            .addChoices(
              { name: "PNP approved channels", value: "pnp-channels" },
              { name: "Media channels", value: "media-channels" },
              { name: "Ignored channels", value: "ignored-channels" },
              { name: "Link-ignored channels", value: "ignored-link-channels" },
              { name: "Word-ignored channels", value: "ignored-word-channels" },
              { name: "Managers", value: "managers" },
              { name: "Blocked links", value: "blocked-links" },
              { name: "Blocked words", value: "blocked-words" },
              { name: "Immune members", value: "immune-members" },
              { name: "Immune roles", value: "immune-roles" },
              { name: "Regular nudity-checked channels", value: "regular-channels" },
              { name: "Log channels", value: "log-channels" },
              { name: "Reaction roles", value: "reaction-roles" },
              { name: "Verification", value: "verification" },
              { name: "Raid gate", value: "raid-gate" },
              { name: "Role guard", value: "role-guard" },
              { name: "All settings", value: "settings" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("verification")
        .setDescription("Configure verification basics")
        .addRoleOption((option) => option.setName("verified-role").setDescription("Role given after verification"))
        .addRoleOption((option) => option.setName("quarantine-role").setDescription("Role used before verification/quarantine"))
        .addIntegerOption((option) =>
          option.setName("min-account-age-days").setDescription("Minimum account age").setMinValue(0).setMaxValue(3650)
        )
        .addBooleanOption((option) => option.setName("deny-young-accounts").setDescription("Kick accounts under the minimum age"))
        .addBooleanOption((option) => option.setName("captcha-enabled").setDescription("Require captcha verification"))
        .addBooleanOption((option) => option.setName("age-gate-enabled").setDescription("Show age-gate status in Guardian settings"))
        .addChannelOption((option) =>
          option
            .setName("verification-channel")
            .setDescription("Channel where Guardian posts the captcha embed")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("media-channel")
        .setDescription("Add or remove a media-only channel")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enabled").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pnp-channel")
        .setDescription("Mark a channel as allowing nudity")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Enabled").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("regular-nudity-channel")
        .setDescription("Add or remove a channel from regular nudity checks")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Checked").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ignore-channel")
        .setDescription("Add or remove a channel ignored by all automod")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Ignored").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ignore-link-channel")
        .setDescription("Add or remove a channel ignored by blocked links")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Ignored").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ignore-word-channel")
        .setDescription("Add or remove a channel ignored by blocked words")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption((option) => option.setName("enabled").setDescription("Ignored").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("block-link")
        .setDescription("Add or remove a blocked link/domain fragment")
        .addStringOption((option) => option.setName("value").setDescription("Link/domain text").setRequired(true))
        .addBooleanOption((option) => option.setName("enabled").setDescription("Blocked").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("block-word")
        .setDescription("Add or remove a blocked word/phrase")
        .addStringOption((option) => option.setName("value").setDescription("Word or phrase").setRequired(true))
        .addBooleanOption((option) => option.setName("enabled").setDescription("Blocked").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("immunity")
        .setDescription("Add or remove immunity for a member")
        .addUserOption((option) => option.setName("member").setDescription("Member").setRequired(true))
        .addBooleanOption((option) => option.setName("enabled").setDescription("Immune").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("immunity-role")
        .setDescription("Add or remove immunity for a role")
        .addRoleOption((option) => option.setName("role").setDescription("Role").setRequired(true))
        .addBooleanOption((option) => option.setName("enabled").setDescription("Immune").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("role-guard")
        .setDescription("Configure elevated-role guard settings")
        .addBooleanOption((option) =>
          option.setName("quarantine-repeat-offenders").setDescription("Quarantine repeat elevated-role offenders")
        )
        .addRoleOption((option) => option.setName("allowed-role").setDescription("Role allowed to grant elevated roles"))
        .addUserOption((option) => option.setName("allowed-member").setDescription("Member allowed to grant elevated roles"))
        .addBooleanOption((option) => option.setName("allowed-enabled").setDescription("Add or remove the allowed role/member"))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("raid-gate")
        .setDescription("Configure raid and nuke gate behavior")
        .addStringOption((option) =>
          option.setName("mode").setDescription("Raid response mode").addChoices(...raidModeChoices)
        )
        .addIntegerOption((option) =>
          option.setName("max-joins-per-minute").setDescription("Join threshold before raid response").setMinValue(2).setMaxValue(100)
        )
        .addIntegerOption((option) =>
          option
            .setName("max-actions-per-minute")
            .setDescription("Sensitive action threshold before nuke response")
            .setMinValue(2)
            .setMaxValue(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reaction-role-add")
        .setDescription("Give a role when members react to a message")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Message channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption((option) => option.setName("message-id").setDescription("Message ID").setRequired(true))
        .addStringOption((option) => option.setName("emoji").setDescription("Emoji to watch").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Role to assign").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reaction-role-remove")
        .setDescription("Remove a reaction role mapping")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Message channel").setRequired(true).addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption((option) => option.setName("message-id").setDescription("Message ID").setRequired(true))
        .addStringOption((option) => option.setName("emoji").setDescription("Emoji mapping to remove").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sync-commands")
        .setDescription("Sync Guardian slash commands")
        .addStringOption((option) =>
          option
            .setName("scope")
            .setDescription("Where commands should be synced")
            .addChoices(
              { name: "Current server", value: "guild" },
              { name: "Global", value: "global" },
              { name: "Current server and clear global duplicates", value: "guild-clean-global" },
              { name: "Global and clear current server duplicates", value: "global-clean-guild" },
              { name: "Clear current server commands", value: "clear-guild" },
              { name: "Clear global commands", value: "clear-global" }
            )
        )
    ),
  new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderate members")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(moderationSubcommand("warn"))
    .addSubcommand(moderationSubcommand("timeout"))
    .addSubcommand(moderationSubcommand("kick"))
    .addSubcommand(moderationSubcommand("ban"))
    .addSubcommand(moderationSubcommand("quarantine"))
    .addSubcommand(moderationSubcommand("servermute"))
    .addSubcommand(moderationSubcommand("serverdeafen"))
].map((command) => command.toJSON());
