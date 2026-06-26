import {
  ChatInputCommandInteraction,
  GuildMember,
  Guild,
  PermissionFlagsBits
} from "discord.js";
import { ConfigStore } from "./config.js";
import { memberDisplayName, sendLog } from "./logging.js";
import { botCanModerate, isImmune } from "./permissions.js";
import { ModerationAction } from "./types.js";

export interface ModerationActionInput {
  guild: Guild | null;
  actor: GuildMember | null;
  target: GuildMember | null;
  reason: string;
  timeoutMinutes?: number;
  reply(content: string): Promise<void>;
}

export async function executeModerationAction(
  store: ConfigStore,
  input: ModerationActionInput,
  action: ModerationAction
): Promise<void> {
  const { guild, actor, target, reason } = input;
  if (!guild || !actor || !(target instanceof GuildMember)) {
    await input.reply("This command can only be used in a server.");
    return;
  }

  const config = store.getGuild(guild.id);
  if (isImmune(target, config)) {
    await input.reply("That member is immune from bot moderation.");
    return;
  }

  const needsModerationPermission = ["timeout", "kick", "ban", "quarantine"].includes(action);
  if (needsModerationPermission && !botCanModerate(target, guild.members.me ?? actor)) {
    await input.reply("I cannot moderate that member because of role hierarchy or missing permissions.");
    return;
  }

  if (action === "warn") {
    await store.addWarning({
      guildId: guild.id,
      userId: target.id,
      moderatorId: actor.id,
      reason,
      createdAt: new Date().toISOString()
    });
    await target.send(`You were warned in ${guild.name}: ${reason}`).catch(() => undefined);
  }

  if (action === "timeout") {
    const minutes = input.timeoutMinutes ?? 10;
    await target.timeout(minutes * 60_000, reason);
  }

  if (action === "kick") await target.kick(reason);
  if (action === "ban") await target.ban({ reason, deleteMessageSeconds: 0 });

  if (action === "quarantine") {
    const quarantineRoleId = config.verification.quarantineRoleId;
    if (!quarantineRoleId) {
      await input.reply("No quarantine role is configured.");
      return;
    }
    await target.roles.add(quarantineRoleId, reason);
  }

  if (action === "servermute" || action === "serverdeafen") {
    const voice = target.voice;
    if (!voice.channel) {
      await input.reply("That member is not in a voice channel.");
      return;
    }
    if (action === "servermute") await voice.setMute(true, reason);
    if (action === "serverdeafen") await voice.setDeaf(true, reason);
  }

  await sendLog(store, guild, "mod", "Moderation action", [
    `Action: ${action}`,
    `Target: ${memberDisplayName(target)}`,
    `Moderator: ${memberDisplayName(actor)}`,
    `Reason: ${reason}`
  ]);

  await input.reply(`${action} completed for ${target.user.tag}.`);
}

export async function runModerationAction(
  store: ConfigStore,
  interaction: ChatInputCommandInteraction,
  action: ModerationAction
): Promise<void> {
  const target = interaction.options.getMember("member");
  await executeModerationAction(
    store,
    {
      guild: interaction.guild,
      actor: interaction.member instanceof GuildMember ? interaction.member : null,
      target: target instanceof GuildMember ? target : null,
      reason: interaction.options.getString("reason") ?? "No reason provided",
      timeoutMinutes: interaction.options.getInteger("minutes") ?? undefined,
      reply: async (content) => {
        await interaction.reply({ content, ephemeral: true });
      }
    },
    action
  );
}

export const moderationPermission = PermissionFlagsBits.ModerateMembers;
