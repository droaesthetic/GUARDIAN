# Hosting Guardian

Guardian is a long-running Discord bot, so it needs either a small VPS or a host that can keep a Node process running. Static-site hosts and serverless functions are not a good fit.

## Best free VPS path: Oracle Cloud Always Free

Oracle Cloud Always Free is the strongest zero-monthly-cost option because it gives you real compute that can run the bot continuously. Oracle lists AMD compute, Arm-based Ampere A1 compute, block volume, object storage, networking, monitoring, and other services in the Always Free tier.

Recommended setup:

1. Create an Oracle Cloud Free Tier account.
2. Create an Always Free Ubuntu VM. Ampere A1 is usually the best target if capacity is available.
3. Open SSH to the VM and install Docker:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
```

4. Log out and back in, then clone this repository.
5. Copy `.env.example` to `.env` and fill in your Discord values.
6. Start Guardian:

```bash
docker compose up -d --build
```

7. Deploy slash commands once:

```bash
docker compose run --rm guardian npm run deploy:commands
```

The Docker setup stores bot state in the named `guardian-data` volume, mounted at `/data`.

## Easiest free hosting path: Render web service

Render currently offers a $0 Hobby workspace and a free service instance type with 512 MB RAM and 0.1 CPU. Some Render workspaces reject background workers with "service type is not available for this plan", so this repository uses `render.yaml` to deploy Guardian as a web service with a tiny health endpoint. The Discord bot still runs as the main process.

Steps:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Add these environment variables:

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
SIGHTENGINE_API_USER
SIGHTENGINE_API_SECRET
NUDITY_PROVIDER_URL
SIGHTENGINE_NUDITY_THRESHOLD
```

4. Deploy the web service.
5. Open a Render shell or one-off job and run:

```bash
npm run deploy:commands
```

Important: Guardian stores settings in `data/guardian.json`. On hosts without a persistent disk, those settings can be lost on rebuilds or restarts. For serious use, prefer the Docker VPS path or use a paid persistent disk.

## Other platforms

Railway currently provides a free trial with one-time credits, then a paid Hobby plan with included monthly usage. Fly.io's public docs describe current free allowances as legacy/deprecated for older organizations, with trial-credit based onboarding for newer accounts. They can run Guardian, but they are not the best answer if the goal is reliably free forever.
