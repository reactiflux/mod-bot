# Stripe Setup Guide for Euno

This guide walks through the complete setup process for Stripe payment processing in production.

## Prerequisites

- A Stripe account (sign up at https://stripe.com)
- Access to production environment variables
- Admin access to the Kubernetes cluster (for production deployment)

## Step 1: Create Stripe Product & Price

### 1.1 Access Stripe Dashboard

1. Log in to your Stripe account at https://dashboard.stripe.com
2. Switch to your desired mode (Test mode for testing, Live mode for production)

### 1.2 Create a Product

1. Navigate to **Products** in the left sidebar
2. Click **+ Add product**
3. Fill in the details:
   - **Name**: Euno Pro
   - **Description**: Premium features for Discord server moderation
   - **Statement descriptor**: EUNO PRO (appears on customer credit card statements)
4. Click **Save product**

### 1.3 Create a Price

1. In the product details, under **Pricing**, click **Add another price**
2. Configure the price:
   - **Price model**: Standard pricing
   - **Price**: $15.00 USD
   - **Billing period**: Monthly
   - **Usage type**: Licensed (metered billing not needed)
3. Click **Add price**
4. **IMPORTANT**: Copy the Price ID (starts with `price_`)
   - Example: `price_1A2B3C4D5E6F7G8H9I0J`
   - You'll need this for the `STRIPE_PRICE_ID` environment variable

## Step 2: Get API Keys

### 2.1 Secret Key

1. Navigate to **Developers** > **API keys**
2. Under **Standard keys**, locate the **Secret key**
3. Click **Reveal test key** (or live key for production)
4. Copy the key (starts with `sk_test_` or `sk_live_`)
   - **⚠️ NEVER commit this to version control**
   - Store it securely in your environment variables

### 2.2 Publishable Key

1. On the same page, find the **Publishable key**
2. Copy the key (starts with `pk_test_` or `pk_live_`)
   - This is safe to expose to clients but still recommended to keep in env vars

## Step 3: Configure Webhook

### 3.1 Create Webhook Endpoint

1. Navigate to **Developers** > **Webhooks**
2. Click **+ Add endpoint**
3. Configure the endpoint:
   - **Endpoint URL**: `https://euno.reactiflux.com/webhooks/stripe`
   - **Description**: Euno subscription webhooks
   - **Events to send**: Select the following:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
4. Click **Add endpoint**

### 3.2 Get Webhook Secret

1. After creating the endpoint, click on it to view details
2. Under **Signing secret**, click **Reveal**
3. Copy the webhook secret (starts with `whsec_`)
   - You'll need this for `STRIPE_WEBHOOK_SECRET`

## Step 4: Configure Environment Variables

### 4.1 Local Development (.env)

For local testing, add these to your `.env` file:

```bash
# Stripe Configuration (Test Mode)
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
STRIPE_PRICE_ID=price_YOUR_PRICE_ID_HERE
```

### 4.2 Production Deployment

#### Option A: Kubernetes Secrets (Recommended)

1. Create a Kubernetes secret:

```bash
kubectl create secret generic stripe-credentials \
  --from-literal=STRIPE_SECRET_KEY='sk_live_YOUR_LIVE_KEY' \
  --from-literal=STRIPE_PUBLISHABLE_KEY='pk_live_YOUR_LIVE_KEY' \
  --from-literal=STRIPE_WEBHOOK_SECRET='whsec_YOUR_WEBHOOK_SECRET' \
  --from-literal=STRIPE_PRICE_ID='price_YOUR_PRICE_ID'
```

2. Update `cluster/deployment.yaml` to reference the secret:

```yaml
env:
  - name: STRIPE_SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: stripe-credentials
        key: STRIPE_SECRET_KEY
  - name: STRIPE_PUBLISHABLE_KEY
    valueFrom:
      secretKeyRef:
        name: stripe-credentials
        key: STRIPE_PUBLISHABLE_KEY
  - name: STRIPE_WEBHOOK_SECRET
    valueFrom:
      secretKeyRef:
        name: stripe-credentials
        key: STRIPE_WEBHOOK_SECRET
  - name: STRIPE_PRICE_ID
    valueFrom:
      secretKeyRef:
        name: stripe-credentials
        key: STRIPE_PRICE_ID
```

#### Option B: GitHub Secrets (for CI/CD)

1. Go to your GitHub repository
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Add repository secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID`
4. Update `.github/workflows/node.js.yml` to inject these as environment variables

## Step 5: Test the Integration

### 5.1 Test Mode Testing

1. Use Stripe's test card numbers:
   - **Success**: `4242 4242 4242 4242`
   - **Declined**: `4000 0000 0000 0002`
   - Any future expiry date, any 3-digit CVC
2. Visit `https://euno.reactiflux.com/upgrade?guild_id=YOUR_TEST_GUILD`
3. Click "Upgrade to Pro" and complete checkout
4. Verify the subscription appears in Stripe Dashboard under **Customers**

### 5.2 Webhook Testing

Use Stripe CLI for local webhook testing:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

### 5.3 Production Verification

1. Create a real subscription using a real credit card
2. Check Stripe Dashboard for the customer and subscription
3. Verify webhook events are being received (check logs)
4. Confirm subscription status in database:

```bash
kubectl exec mod-bot-set-0 -- sqlite3 /data/mod-bot.sqlite3 \
  "SELECT * FROM guild_subscriptions WHERE product_tier='paid';"
```

## Step 6: Monitor & Maintain

### 6.1 Important Dashboards

- **Stripe Dashboard** > **Payments**: Monitor successful/failed payments
- **Stripe Dashboard** > **Subscriptions**: Track active subscriptions
- **Stripe Dashboard** > **Webhooks**: Monitor webhook delivery success rate

### 6.2 Set Up Alerts

Configure alerts in Stripe for:

- Failed payments
- Subscription cancellations
- Webhook delivery failures

### 6.3 Regular Checks

- **Weekly**: Review failed payment attempts
- **Monthly**: Reconcile Stripe subscriptions with database records
- **Quarterly**: Review and update pricing if needed

## Troubleshooting

### Webhook not receiving events

1. Check webhook URL is correct and publicly accessible
2. Verify webhook secret matches environment variable
3. Check Stripe Dashboard > Webhooks > [Your endpoint] for delivery logs
4. Ensure firewall/security groups allow Stripe IPs

### Payments failing

1. Check Stripe Dashboard > Payments for error details
2. Verify `STRIPE_PRICE_ID` is correct
3. Ensure API keys are for the correct mode (test vs live)
4. Check application logs for Stripe SDK errors

### Database out of sync

Run this query to find mismatches:

```sql
SELECT gs.guild_id, gs.stripe_subscription_id, gs.product_tier, gs.status
FROM guild_subscriptions gs
WHERE gs.product_tier = 'paid' AND gs.status = 'active';
```

Then cross-reference with Stripe Dashboard subscriptions.

## Security Best Practices

1. **Never commit API keys** to version control
2. **Rotate keys regularly** (every 90 days recommended)
3. **Use test mode** for all development/staging environments
4. **Validate webhook signatures** (already implemented in code)
5. **Monitor for unusual activity** in Stripe Dashboard
6. **Implement rate limiting** on payment endpoints (TODO)
7. **Log all payment events** for audit trail (already implemented)

## Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Testing Stripe](https://stripe.com/docs/testing)
- [Stripe Security](https://stripe.com/docs/security/stripe)

## Support

If you encounter issues:

1. Check Stripe Dashboard for error details
2. Review application logs for errors
3. Consult [Stripe Support](https://support.stripe.com)
4. Check our internal documentation for known issues
