import { env } from "./env.js";

export interface NudityResult {
  unsafe: boolean;
  reason?: string;
}

interface SightengineResponse {
  status?: string;
  nudity?: Record<string, unknown>;
}

function scoreFrom(nudity: Record<string, unknown>, key: string): number {
  const value = nudity[key];
  return typeof value === "number" ? value : 0;
}

function evaluateSightengine(body: SightengineResponse): NudityResult {
  if (body.status !== "success" || !body.nudity) return { unsafe: false };

  const scores = {
    sexual_activity: scoreFrom(body.nudity, "sexual_activity"),
    sexual_display: scoreFrom(body.nudity, "sexual_display"),
    erotica: scoreFrom(body.nudity, "erotica"),
    very_suggestive: scoreFrom(body.nudity, "very_suggestive")
  };

  const [reason, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return {
    unsafe: score >= env.SIGHTENGINE_NUDITY_THRESHOLD,
    reason: `${reason} ${score.toFixed(2)}`
  };
}

async function checkWithSightengine(url: string): Promise<NudityResult> {
  if (!env.SIGHTENGINE_API_USER || !env.SIGHTENGINE_API_SECRET) return { unsafe: false };

  const params = new URLSearchParams({
    url,
    models: "nudity-2.1",
    api_user: env.SIGHTENGINE_API_USER,
    api_secret: env.SIGHTENGINE_API_SECRET
  });

  const response = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`).catch(() => null);
  if (!response?.ok) return { unsafe: false };

  const body = (await response.json().catch(() => null)) as SightengineResponse | null;
  return body ? evaluateSightengine(body) : { unsafe: false };
}

export async function checkImageForNudity(url: string): Promise<NudityResult> {
  if (!env.NUDITY_PROVIDER_URL) return checkWithSightengine(url);

  const response = await fetch(env.NUDITY_PROVIDER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url })
  }).catch(() => null);

  if (!response?.ok) return { unsafe: false };
  const body = (await response.json().catch(() => null)) as Partial<NudityResult> | null;
  return { unsafe: body?.unsafe === true, reason: body?.reason };
}
