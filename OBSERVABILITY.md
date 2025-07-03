# Observability & Logging Best Practices

This document outlines the comprehensive observability features implemented in the subscription service, following industry best practices for production-ready applications.

## Overview

The subscription service now includes:

- Structured logging
- Performance tracking
- Error tracking
- Audit trails
- Metrics collection
- Debug information

## Logging Architecture

### Structured Logging Format

All logs follow a consistent JSON structure for easy parsing and analysis:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "service": "subscription",
  "message": "Subscription created successfully",
  "guildId": "123456789",
  "productTier": "paid",
  "operation": "create",
  "duration_ms": 45,
  "hr_duration_ms": 44.8
}
```

### Log Levels

- `debug`: Detailed information for troubleshooting
- `info`: General operational information
- `warn`: Warning conditions that don't stop execution
- `error`: Error conditions that may affect functionality

### Context Enrichment

Every log entry includes relevant context:

- `guildId`: The Discord guild identifier
- `operation`: The specific operation being performed
- `productTier`: Current subscription tier
- `duration_ms`: Operation execution time
- `service`: Service identifier for multi-service environments

## Performance Monitoring

### High-Resolution Timing

The service uses both `Date.now()` and `process.hrtime.bigint()` for accurate performance measurement:

```typescript
const startTime = Date.now();
const startHrTime = process.hrtime.bigint();

// ... operation ...

const duration = Date.now() - startTime;
const hrDuration = Number(process.hrtime.bigint() - startHrTime) / 1000000;
```

## Error Handling & Tracking

### Structured Error Logging

Errors are logged with full context:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "error",
  "service": "subscription",
  "message": "Failed getGuildSubscription",
  "operation": "getGuildSubscription",
  "guildId": "123456789",
  "duration_ms": 150,
  "error": "Database connection timeout",
  "stack": "Error: Database connection timeout\n    at ..."
}
```

### Sentry Error Tracking

All errors are automatically captured in Sentry with:

- Full stack traces
- Contextual tags (service, guildId, operation)
- Performance data
- Custom breadcrumbs for debugging

## Audit Trail

### Subscription Changes

All subscription modifications are logged for audit purposes:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "service": "subscription",
  "message": "Subscription updated successfully",
  "guildId": "123456789",
  "operation": "update",
  "previousTier": "free",
  "newTier": "paid",
  "previousStatus": "active",
  "newStatus": "active"
}
```

### Audit Events

The `auditSubscriptionChanges` method provides a dedicated audit logging interface:

```typescript
await SubscriptionService.auditSubscriptionChanges(guildId, "tier_upgrade", {
  fromTier: "free",
  toTier: "paid",
  reason: "user_purchase",
  stripeSubscriptionId: "sub_123",
});
```

## Metrics Collection

### Business Metrics

The service provides comprehensive subscription metrics:

```typescript
const metrics = await SubscriptionService.getSubscriptionMetrics();
// Returns:
// {
//   totalSubscriptions: 150,
//   activeSubscriptions: 120,
//   freeSubscriptions: 80,
//   paidSubscriptions: 40,
//   inactiveSubscriptions: 30
// }
```

### Key Performance Indicators

Track important business metrics:

- **Total subscriptions**: Overall customer base
- **Active subscriptions**: Currently active customers
- **Free vs Paid ratio**: Conversion metrics
- **Inactive subscriptions**: Churn indicators

## Debugging & Troubleshooting

### Debug Logging

Enable debug logging for detailed troubleshooting:

```typescript
// Debug logs show detailed operation flow
log("debug", "Fetching guild subscription", { guildId });
log("debug", "Found existing subscription", {
  guildId,
  productTier: result.product_tier,
  status: result.status,
});
```

## Usage Examples

### Basic Operation with Logging

```typescript
// Get subscription with automatic logging
const subscription = await SubscriptionService.getGuildSubscription(guildId);

// Create subscription with audit trail
await SubscriptionService.createOrUpdateSubscription({
  guild_id: guildId,
  product_tier: "paid",
  stripe_customer_id: "cus_123",
  stripe_subscription_id: "sub_456",
});

// Check feature access with performance tracking
const hasFeature = await SubscriptionService.hasFeature(guildId, "csv_export");
```

### Metrics Collection

```typescript
// Get business metrics
const metrics = await SubscriptionService.getSubscriptionMetrics();
console.log(`Active subscriptions: ${metrics.activeSubscriptions}`);
console.log(
  `Paid conversion rate: ${((metrics.paidSubscriptions / metrics.totalSubscriptions) * 100).toFixed(1)}%`,
);
```

### Custom Audit Events

```typescript
// Log custom audit events
await SubscriptionService.auditSubscriptionChanges(
  guildId,
  "manual_downgrade",
  {
    reason: "payment_failure",
    adminUser: "admin@example.com",
    notes: "Customer requested downgrade",
  },
);
```

## Monitoring & Alerting

### Recommended Alerts

1. **Error Rate**: Alert when error rate exceeds 5%
2. **Performance**: Alert when operations take > 500ms
3. **Business Metrics**: Alert on significant subscription changes
4. **Database Issues**: Alert on database connection failures

### Dashboard Metrics

Monitor these key metrics:

- Subscription creation/update rates
- Tier conversion rates
- Error rates by operation
- Performance percentiles
- Active vs inactive subscription trends

## Future Enhancements

### Planned Improvements

1. **Distributed Tracing**: Add trace IDs for request correlation
2. **Custom Metrics**: Integration with Prometheus/Grafana
3. **Log Aggregation**: Centralized log management (ELK stack)
4. **Health Checks**: Service health monitoring endpoints
5. **Rate Limiting**: Track and log rate limit events

### Scalability Considerations

- Log volume management
- Performance impact of logging
- Storage and retention policies
- Query optimization for metrics

## Conclusion

The subscription service now provides comprehensive observability that enables:

- **Proactive monitoring** of system health
- **Quick debugging** of issues
- **Business intelligence** through metrics
- **Compliance** through audit trails
- **Performance optimization** through detailed timing

This implementation follows industry best practices and provides a solid foundation for production operations.
