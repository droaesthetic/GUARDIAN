import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GuildConfig,
  LogChannelKey,
  StoreData,
  StoredWarning
} from "./types.js";

const dataDir = path.resolve(process.env.GUARDIAN_DATA_DIR || "data");
const dataPath = path.join(dataDir, "guardian.json");

const defaultData: StoreData = {
  guilds: {},
  warnings: []
};

function defaultGuildConfig(guildId: string): GuildConfig {
  return {
    guildId,
    managers: [],
    immuneMemberIds: [],
    immuneRoleIds: [],
    logChannels: {},
    verification: {
      enabled: false,
      captchaEnabled: true,
      minAccountAgeDays: 7,
      denyYoungAccounts: false,
      ageGateEnabled: false
    },
    roleGuard: {
      enabled: true,
      quarantineRepeatOffenders: false,
      allowedRoleIds: [],
      allowedMemberIds: [],
      elevatedPermissionNames: [
        "Administrator",
        "ManageGuild",
        "ManageRoles",
        "ManageChannels",
        "ManageWebhooks",
        "ManageMessages",
        "BanMembers",
        "KickMembers",
        "ModerateMembers"
      ]
    },
    automod: {
      enabled: true,
      mediaOnlyChannelIds: [],
      pnpChannelIds: [],
      regularChannelIds: [],
      ignoredChannelIds: [],
      ignoredLinkChannelIds: [],
      ignoredWordChannelIds: [],
      blockedLinks: [],
      blockedWords: [],
      nudityDetectionEnabled: false,
      raidMode: "watch",
      maxJoinsPerMinute: 10,
      maxModerationActionsPerMinute: 8
    },
    reactionRoles: []
  };
}

export class ConfigStore {
  private data: StoreData = defaultData;

  async load(): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    try {
      this.data = JSON.parse(await readFile(dataPath, "utf8")) as StoreData;
    } catch {
      this.data = structuredClone(defaultData);
      await this.save();
    }
  }

  async save(): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }

  getGuild(guildId: string): GuildConfig {
    this.data.guilds[guildId] ??= defaultGuildConfig(guildId);
    const config = this.data.guilds[guildId];
    const defaults = defaultGuildConfig(guildId);
    config.managers ??= [];
    config.immuneMemberIds ??= [];
    config.immuneRoleIds ??= [];
    config.logChannels ??= {};
    config.verification ??= defaults.verification;
    config.verification.enabled ??= defaults.verification.enabled;
    config.verification.captchaEnabled ??= defaults.verification.captchaEnabled;
    config.verification.minAccountAgeDays ??= defaults.verification.minAccountAgeDays;
    config.verification.denyYoungAccounts ??= defaults.verification.denyYoungAccounts;
    config.verification.ageGateEnabled ??= defaults.verification.ageGateEnabled;
    config.roleGuard ??= defaults.roleGuard;
    config.roleGuard.enabled ??= defaults.roleGuard.enabled;
    config.roleGuard.quarantineRepeatOffenders ??= defaults.roleGuard.quarantineRepeatOffenders;
    config.roleGuard.allowedRoleIds ??= [];
    config.roleGuard.allowedMemberIds ??= [];
    config.roleGuard.elevatedPermissionNames ??= defaults.roleGuard.elevatedPermissionNames;
    config.automod ??= defaults.automod;
    config.automod.enabled ??= defaults.automod.enabled;
    config.automod.mediaOnlyChannelIds ??= [];
    config.automod.pnpChannelIds ??= [];
    config.automod.regularChannelIds ??= [];
    config.automod.ignoredChannelIds ??= [];
    config.automod.ignoredLinkChannelIds ??= [];
    config.automod.ignoredWordChannelIds ??= [];
    config.automod.blockedLinks ??= [];
    config.automod.blockedWords ??= [];
    config.automod.nudityDetectionEnabled ??= defaults.automod.nudityDetectionEnabled;
    config.automod.raidMode ??= defaults.automod.raidMode;
    config.automod.maxJoinsPerMinute ??= defaults.automod.maxJoinsPerMinute;
    config.automod.maxModerationActionsPerMinute ??= defaults.automod.maxModerationActionsPerMinute;
    config.reactionRoles ??= [];
    return config;
  }

  async updateGuild(guildId: string, update: (config: GuildConfig) => void): Promise<GuildConfig> {
    const config = this.getGuild(guildId);
    update(config);
    await this.save();
    return config;
  }

  async setLogChannel(guildId: string, key: LogChannelKey, channelId?: string): Promise<void> {
    await this.updateGuild(guildId, (config) => {
      if (channelId) config.logChannels[key] = channelId;
      else delete config.logChannels[key];
    });
  }

  async addWarning(warning: StoredWarning): Promise<void> {
    this.data.warnings.push(warning);
    await this.save();
  }

  warningsFor(guildId: string, userId: string): StoredWarning[] {
    return this.data.warnings.filter((warning) => warning.guildId === guildId && warning.userId === userId);
  }
}
