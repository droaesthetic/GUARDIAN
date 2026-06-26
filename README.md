# Guardian Discord Bot

Guardian is a configurable Discord server moderation and management bot. It is built with Discord.js and TypeScript.

## What is implemented

- Owner/delegated-manager configuration through `/guardian`.
- Server-owner-only manager add/remove.
- Configurable immunity for members and roles.
- Captcha verification for new members.
- Minimum Discord account age check with optional denial for young accounts.
- Quarantine role support.
- Moderation commands through `/mod`: warn, timeout, kick, ban, quarantine, servermute, and serverdeafen.
- Mod action logging.
- Optional log channels for messages, joins/leaves, voice, member changes, server/security changes, onboarding/server profile changes, and staff permission actions.
- Media-only channels that silently delete non-media posts.
- Blocked link and blocked word filters.
- Channel ignores for all automod, blocked links only, or blocked words only.
- PNP channel configuration for channels where nudity is allowed.
- Regular nudity-check channel configuration for servers that only want checks in selected channels.
- Optional nudity detection through Sightengine or a custom classifier endpoint.
- Role guard that removes elevated roles when an unauthorized member grants them.
- Optional repeat-offender quarantine for role-guard violations.
- Raid/nuke monitoring foundations based on join/action rates and sensitive audit-log events.

## Important Discord limitations

Discord bots cannot truly verify a member's real-world age by themselves. Guardian supports practical server-side checks:

- Deny or quarantine accounts younger than a configured number of days.
- Gate access behind captcha verification.
- Keep an optional age-gate policy outside the bot if your server requires real age verification.

Nudity detection also requires image classification. Guardian supports Sightengine directly. Create a Sightengine account, copy your API user and API secret from the dashboard, then put them in `.env`:

```env
SIGHTENGINE_API_USER=your-sightengine-api-user
SIGHTENGINE_API_SECRET=your-sightengine-api-secret
SIGHTENGINE_NUDITY_THRESHOLD=0.65
```

Guardian uses Sightengine's `nudity-2.1` image model and treats `sexual_activity`, `sexual_display`, `erotica`, or `very_suggestive` scores at or above the configured threshold as unsafe.

You can also use a custom provider instead. Set `NUDITY_PROVIDER_URL` to an HTTP service that accepts:

```json
{ "url": "https://cdn.discordapp.com/..." }
```

and returns:

```json
{ "unsafe": true, "reason": "nudity" }
```

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - optionally `DISCORD_GUILD_ID` for development command deployment
   - optionally `SIGHTENGINE_API_USER` and `SIGHTENGINE_API_SECRET` for nudity detection
   - optionally `NUDITY_PROVIDER_URL` for a custom classifier instead of Sightengine
3. In the Discord Developer Portal, enable these privileged intents for the bot:
   - Server Members Intent
   - Message Content Intent
4. Install dependencies:

```bash
npm install
```

5. Deploy slash commands:

```bash
npm run deploy:commands
```

If Discord shows duplicate slash commands, the bot has both global and current-server command registrations. Use `/guardian sync-commands` and choose either `Global and clear current server duplicates` or `Current server and clear global duplicates`, depending on which scope you want to keep.

6. Start the bot:

```bash
npm run build
npm start
```

## First server configuration

Run these as the server owner:

```text
/guardian set-log type:Moderation actions channel:#mod-log
/guardian set-log type:Security channel:#security-log
/guardian verification verified-role:@Verified quarantine-role:@Quarantine verification-channel:#verify min-account-age-days:7 deny-young-accounts:true captcha-enabled:true age-gate-enabled:true
/guardian toggle module:Verification enabled:true
/guardian raid-gate mode:Lockdown max-joins-per-minute:10 max-actions-per-minute:8
/guardian media-channel channel:#media enabled:true
/guardian pnp-channel channel:#pnp enabled:true
/guardian regular-nudity-channel channel:#general enabled:true
/guardian ignore-channel channel:#off-topic enabled:true
/guardian ignore-link-channel channel:#partners enabled:true
/guardian ignore-word-channel channel:#quotes enabled:true
/guardian block-link value:bad-domain.example enabled:true
/guardian block-word value:bad phrase enabled:true
/guardian immunity member:@TrustedUser enabled:true
/guardian immunity-role role:@Staff enabled:true
/guardian role-guard quarantine-repeat-offenders:true allowed-role:@Admin allowed-enabled:true
```

Only the server owner can add or remove Guardian managers:

```text
/guardian manager-add member:@TrustedAdmin
/guardian manager-remove member:@TrustedAdmin
```

## Development

Type-check:

```bash
npm run check
```

Build:

```bash
npm run build
```

Compiled files are written to `dist/`. Runtime configuration and warnings are stored in `data/guardian.json`.

## Hosting

For free hosting, use the Docker setup on an Always Free VPS when possible:

```bash
docker compose up -d --build
docker compose run --rm guardian npm run deploy:commands
```

Render deployment is also configured through `render.yaml`, but free hosts without persistent disks can lose `data/guardian.json` across rebuilds or restarts. See `docs/hosting.md` for the full hosting guide.
