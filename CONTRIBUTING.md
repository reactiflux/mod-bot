# Contributing

## Setting up the bot

1. Create a new Discord bot [in the developer portal](https://discord.com/developers/applications)
1. Fork the repository
1. Clone your fork to your computer
   1. If you'd like to get a tour of the codebase and a second pair of eyes during setup, snag a slot on [the calendar](https://calendly.com/vcarl/bots)
1. Copy `.env.example` to `.env`
1. Configure env variable
   1. From the General Information page:
      1. <img width="328" alt="discord-general-settings" src="https://user-images.githubusercontent.com/1551487/221075576-e03f6d76-903f-4005-adf6-40a93b10183f.png">
      1. Copy the Application ID as `DISCORD_APP_ID`
      1. Copy the Public Key as `DISCORD_PUBLIC_KEY`
   1. From the Bot page:
      1. <img width="335" alt="discord-bot-settings" src="https://user-images.githubusercontent.com/1551487/221075742-17794152-ad14-4437-8680-87d7050fd829.png">
      1. Reset the bot's token and paste the new one as `DISCORD_HASH`
      1. <img width="300" alt="discord-token" src="https://user-images.githubusercontent.com/1551487/221075839-93f5bc23-cdb2-4e43-8b8c-d596cea0b6af.png">
   1. (optional) Request access token for Amplitude metrics from vcarl#7694 and paste the token as `AMPLITUDE_KEY`
1. From the Bot page: 3 settings off, 2 settings on
   1. Public Bot off
   1. Requires Oauth2 Code Grant off
   1. Presence Intent off
   1. Server Members Intent on
   1. Message Content Intent on
1. `npm install`
1. `npm run dev`
1. Look for the following message in the logs, and open the URL in a browser where you're logged into Discord.
   - `Bot started. If necessary, add it to your test server:`

# Implementation notes

There are subtle issues when making some chaings. These are notes for steps to take to make sure it's done correctly when needed.

## Environment variables

Adding a new environment variable needs to be done in several places to work corectly and be predictable for new developers:

- Add a suitable example to `.env.example`
- Add to your own `.env` (and restart the dev server)
- Add to the action in `.github/workflows/node.js.yml`
- Add to the Kubernetes config under `cluster/deployment.yml

## GitHub Secrets for CI

The following GitHub Secrets must be configured in the repository for CI to run successfully:

### Required for E2E Tests

- `STRIPE_TEST_SECRET_KEY` - Stripe test mode secret key (starts with `sk_test_`)
- `STRIPE_TEST_PUBLISHABLE_KEY` - Stripe test mode publishable key (starts with `pk_test_`)

These can be obtained from the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) in test mode.

**Note**: These are TEST mode keys only and will not charge real money. Never use production Stripe keys in CI.

### Required for Deployment

- `DIGITALOCEAN_TOKEN` - DigitalOcean API token for Kubernetes deployment
- `SESSION_SECRET` - Secret for encrypting session cookies
- `DISCORD_PUBLIC_KEY` - Discord bot public key
- `DISCORD_APP_ID` - Discord application ID
- `DISCORD_SECRET` - Discord OAuth2 client secret
- `DISCORD_HASH` - Discord bot token
- `DISCORD_TEST_GUILD` - Test Discord server ID
- `SENTRY_INGEST` - Sentry error tracking ingest URL
- `SENTRY_RELEASES` - Sentry releases API endpoint
- `VITE_PUBLIC_POSTHOG_KEY` - PostHog analytics key
- `VITE_PUBLIC_POSTHOG_HOST` - PostHog analytics host
- `DATABASE_URL` - Production database connection string

# Useful DevOps commands

This bot runs on a managed Kubernetes cluster on DigitalOcean. It's possible (tho beyond the scope of this document) to configure a local `kubectl` environment to access and control this cluster. What follows are reference commands for performing common tasks:

```sh
# Tail the logs of the production instance
kubectl logs -f mod-bot-set-0

# Force a restart without merging a PR (as of 2024-09 only 1 replica is in use)
kubectl scale statefulset mod-bot-set --replicas 0
kubectl scale statefulset mod-bot-set --replicas 1

# Copy out the production database (for backups!)
kubectl cp mod-bot-set-0:data/mod-bot.sqlite3 ./mod-bot-prod.sqlite3

# Execute a command on the production instance.
# Rarely necessary, but useful for diagnostics if something's gone sideways.
kubectl exec mod-bot-set-0 -- npm run start:migrate

# Extract production secrets (in base64)
kubectl get secret modbot-env -o json
```
