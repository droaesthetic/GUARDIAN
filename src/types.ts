import type { PermissionResolvable } from "discord.js";

export type LogChannelKey =
  | "mod"
  | "message"
  | "joinLeave"
  | "voice"
  | "member"
  | "server"
  | "security"
  | "onboarding"
  | "permissionActions";

export type ModerationAction =
  | "warn"
  | "timeout"
  | "kick"
  | "ban"
  | "quarantine"
  | "servermute"
  | "serverdeafen";

export type RaidMode = "off" | "watch" | "lockdown";

export interface VerificationConfig {
  enabled: boolean;
  captchaEnabled: boolean;
  minAccountAgeDays: number;
  denyYoungAccounts: boolean;
  verifiedRoleId?: string;
  quarantineRoleId?: string;
  verificationChannelId?: string;
  ageGateEnabled: boolean;
}

export interface RoleGuardConfig {
  enabled: boolean;
  quarantineRepeatOffenders: boolean;
  allowedRoleIds: string[];
  allowedMemberIds: string[];
  elevatedPermissionNames: PermissionResolvable[];
}

export interface AutomodConfig {
  enabled: boolean;
  mediaOnlyChannelIds: string[];
  pnpChannelIds: string[];
  regularChannelIds: string[];
  ignoredChannelIds: string[];
  ignoredLinkChannelIds: string[];
  ignoredWordChannelIds: string[];
  blockedLinks: string[];
  blockedWords: string[];
  nudityDetectionEnabled: boolean;
  raidMode: RaidMode;
  maxJoinsPerMinute: number;
  maxModerationActionsPerMinute: number;
}

export interface ReactionRoleConfig {
  channelId: string;
  messageId: string;
  emoji: string;
  emojiDisplay: string;
  roleId: string;
}

export interface GuildConfig {
  guildId: string;
  managers: string[];
  immuneMemberIds: string[];
  immuneRoleIds: string[];
  logChannels: Partial<Record<LogChannelKey, string>>;
  verification: VerificationConfig;
  roleGuard: RoleGuardConfig;
  automod: AutomodConfig;
  reactionRoles: ReactionRoleConfig[];
}

export interface StoredWarning {
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: string;
}

export interface StoreData {
  guilds: Record<string, GuildConfig>;
  warnings: StoredWarning[];
}
