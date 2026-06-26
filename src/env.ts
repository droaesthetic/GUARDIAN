import "dotenv/config";
import { z } from "zod";

const optionalEnvString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: optionalEnvString,
  NUDITY_PROVIDER_URL: optionalUrl,
  SIGHTENGINE_API_USER: optionalEnvString,
  SIGHTENGINE_API_SECRET: optionalEnvString,
  SIGHTENGINE_NUDITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65)
});

export const env = EnvSchema.parse(process.env);
