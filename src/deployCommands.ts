import { syncApplicationCommands } from "./commandSync.js";
import { env } from "./env.js";

const mode = process.argv[2];
const guildId = process.argv[3] || env.DISCORD_GUILD_ID;

if (mode === "clear-guild" || mode === "global-clean-guild") {
  if (!guildId) throw new Error(`${mode} requires a guild ID argument or DISCORD_GUILD_ID.`);
  const result = await syncApplicationCommands(mode, guildId);
  console.log(`Synced ${result.syncedCount} command groups. Cleared: ${result.clearedScopes.join(", ") || "none"}.`);
} else if (mode === "clear-global" || mode === "guild-clean-global") {
  const result = await syncApplicationCommands(mode, guildId);
  console.log(`Synced ${result.syncedCount} command groups. Cleared: ${result.clearedScopes.join(", ") || "none"}.`);
} else if (guildId) {
  const result = await syncApplicationCommands("guild", guildId);
  console.log(`Registered ${result.syncedCount} guild command groups.`);
} else {
  const result = await syncApplicationCommands("global");
  console.log(`Registered ${result.syncedCount} global command groups.`);
}
