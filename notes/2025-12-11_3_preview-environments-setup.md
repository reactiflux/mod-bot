# Preview Environments Setup

Per-PR preview deployments at `https://<pr-number>.euno-staging.reactiflux.com`

## Manual Setup Required

Complete these before the workflow will function:

### 1. DNS (DigitalOcean)
Add wildcard A record:
```
*.euno-staging.reactiflux.com → <cluster ingress IP>
```

Get ingress IP:
```sh
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### 2. Wildcard TLS Certificate

Create cert-manager Certificate for wildcard domain. Requires DNS-01 challenge (can't use HTTP-01 for wildcards).

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: euno-staging-wildcard
  namespace: staging
spec:
  secretName: euno-staging-wildcard-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "*.euno-staging.reactiflux.com"
```

May need to configure DNS-01 solver with DigitalOcean API token if not already set up.

### 3. Staging Namespace
```sh
kubectl create namespace staging
```

### 4. Discord Staging App

1. Go to https://discord.com/developers/applications
2. Create new application "Mod Bot Staging"
3. Enable bot, get token
4. Configure OAuth2 redirect: `https://*.euno-staging.reactiflux.com/auth/discord/callback`
   - Note: May need individual redirects per preview, or use a proxy

### 5. Staging Secret

```sh
kubectl create secret generic modbot-staging-env -n staging \
  --from-literal=DISCORD_APP_ID=<staging app id> \
  --from-literal=DISCORD_PUBLIC_KEY=<staging public key> \
  --from-literal=DISCORD_SECRET=<staging oauth secret> \
  --from-literal=DISCORD_HASH=<staging bot token> \
  --from-literal=DISCORD_TEST_GUILD=<test server id> \
  --from-literal=STRIPE_SECRET_KEY=sk_test_... \
  --from-literal=STRIPE_PUBLISHABLE_KEY=pk_test_... \
  --from-literal=STRIPE_WEBHOOK_SECRET=placeholder \
  --from-literal=SESSION_SECRET=$(openssl rand -hex 32) \
  --from-literal=DATABASE_URL=":memory:" \
  --from-literal=SENTRY_INGEST="" \
  --from-literal=SENTRY_RELEASES="" \
  --from-literal=VITE_PUBLIC_POSTHOG_KEY="" \
  --from-literal=VITE_PUBLIC_POSTHOG_HOST=""
```

## Workflow Behavior

- **Draft PRs**: No preview deployed
- **`no-preview` label**: Skips deployment, cleans up existing
- **On push**: Rebuilds and redeploys
- **On close**: Cleans up all preview resources
- **On ready_for_review**: Deploys preview

## Files Created

- `.github/workflows/preview.yml` - Workflow for deploy/cleanup
- `cluster/preview/deployment.yaml` - K8s template with `${PR_NUMBER}` placeholders

## Future Improvements

- [ ] Seed script for preview data (in-memory DB starts empty)
- [ ] Auto-cleanup of stale previews (e.g., no activity for 7 days)
- [ ] Scale to zero with KEDA when not in use
- [ ] Proper Discord OAuth redirect handling for dynamic subdomains
