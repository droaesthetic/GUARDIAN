import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";
import { env } from "./env.js";

export type CommandSyncScope = "guild" | "global";

export type CommandSyncMode =
  | "guild"
  | "global"
  | "clear-guild"
  | "clear-global"
  | "guild-clean-global"
  | "global-clean-guild";

export interface CommandSyncResult {
  syncedScope?: CommandSyncScope;
  syncedCount: number;
  clearedScopes: CommandSyncScope[];
}

export async function syncApplicationCommands(scope: CommandSyncMode, guildId?: string): Promise<CommandSyncResult> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const result: CommandSyncResult = {
    syncedCount: 0,
    clearedScopes: []
  };

  if (scope === "clear-global" || scope === "guild-clean-global") {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: [] });
    result.clearedScopes.push("global");
  }

  if (scope === "clear-guild" || scope === "global-clean-guild") {
    if (!guildId) throw new Error("Guild command sync requires a guild ID.");
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: [] });
    result.clearedScopes.push("guild");
  }

  if (scope === "guild" || scope === "guild-clean-global") {
    if (!guildId) throw new Error("Guild command sync requires a guild ID.");
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: commands });
    result.syncedScope = "guild";
    result.syncedCount = commands.length;
  }

  if (scope === "global" || scope === "global-clean-guild") {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
    result.syncedScope = "global";
    result.syncedCount = commands.length;
  }

  return result;
}
