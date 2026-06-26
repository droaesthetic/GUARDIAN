import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { ConfigStore } from "./config.js";
import { memberDisplayName, sendLog } from "./logging.js";

interface PendingCaptcha {
  guildId: string;
  userId: string;
  code: string;
  expiresAt: number;
}

const pending = new Map<string, PendingCaptcha>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function makeCaptcha(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function accountAgeDays(member: GuildMember): number {
  return Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
}

export async function startVerification(store: ConfigStore, member: GuildMember): Promise<void> {
  const config = store.getGuild(member.guild.id);
  if (!config.verification.enabled || member.user.bot) return;

  const ageDays = accountAgeDays(member);
  if (config.verification.denyYoungAccounts && ageDays < config.verification.minAccountAgeDays) {
    await member.kick(`Account age under ${config.verification.minAccountAgeDays} days`).catch(() => undefined);
    await sendLog(store, member.guild, "security", "Verification denied", [
      `${memberDisplayName(member)} was denied verification.`,
      `Account age: ${ageDays} days.`,
      `Required account age: ${config.verification.minAccountAgeDays} days.`
    ]);
    return;
  }

  if (config.verification.quarantineRoleId) {
    await member.roles.add(config.verification.quarantineRoleId, "Pending verification").catch(() => undefined);
  }

  if (!config.verification.captchaEnabled) return;

  const code = makeCaptcha();
  pending.set(key(member.guild.id, member.id), {
    guildId: member.guild.id,
    userId: member.id,
    code,
    expiresAt: Date.now() + 15 * 60_000
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`guardian:verify:${member.guild.id}`)
      .setLabel("Verify")
      .setStyle(ButtonStyle.Primary)
  );

  await member.send({
    content: `Welcome to ${member.guild.name}. Enter this captcha code to verify: **${code}**`,
    components: [row]
  }).catch(async () => {
    if (!config.verification.verificationChannelId) return;
    const channel = await member.guild.channels.fetch(config.verification.verificationChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ content: `${member}, I could not DM you. Enable DMs, then press verify.`, components: [row] });
    }
  });
}

export function verificationModal(guildId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`guardian:verify-modal:${guildId}`)
    .setTitle("Server Verification")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("captcha")
          .setLabel("Captcha code")
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
      )
    );
}

export async function completeVerification(
  store: ConfigStore,
  member: GuildMember,
  submittedCode: string
): Promise<boolean> {
  const config = store.getGuild(member.guild.id);
  const captcha = pending.get(key(member.guild.id, member.id));
  if (!captcha || captcha.expiresAt < Date.now()) return false;
  if (captcha.code !== submittedCode.trim().toUpperCase()) return false;

  pending.delete(key(member.guild.id, member.id));
  if (config.verification.quarantineRoleId) {
    await member.roles.remove(config.verification.quarantineRoleId, "Verification complete").catch(() => undefined);
  }
  if (config.verification.verifiedRoleId) {
    await member.roles.add(config.verification.verifiedRoleId, "Verification complete").catch(() => undefined);
  }

  await sendLog(store, member.guild, "joinLeave", "Member verified", [`${memberDisplayName(member)} completed captcha verification.`]);
  return true;
}
