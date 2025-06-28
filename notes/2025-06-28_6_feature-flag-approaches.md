# Feature Flag Approaches - 2025-06-28

## Common Approaches for Web + Bot Architecture

### 1. **Database-Driven (Recommended for Euno)**
**Pros**: Simple, consistent across web/bot, already have DB
**Cons**: DB queries for each check (mitigated with caching)

```sql
-- New table
CREATE TABLE feature_flags (
  guild_id TEXT,
  feature_name TEXT,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  PRIMARY KEY (guild_id, feature_name)
);

-- Or extend guilds table
ALTER TABLE guilds ADD COLUMN feature_flags TEXT; -- JSON blob
```

### 2. **Environment Variables + Database Hybrid**
**Pros**: Global flags via env, per-guild via DB
**Cons**: Two systems to manage

```bash
# Global feature toggles
FEATURE_ADVANCED_ANALYTICS=true
FEATURE_PREMIUM_EXPORTS=false

# Per-guild stored in DB
```

### 3. **Config File + Database**
**Pros**: Version controlled global flags, dynamic per-guild
**Cons**: Requires deployment for global changes

### 4. **External Service (LaunchDarkly/Split)**
**Pros**: Professional tooling, A/B testing, gradual rollouts
**Cons**: External dependency, cost, overkill for current needs

## Recommended Architecture for Euno

### **Hybrid Approach: Global + Per-Guild**

```typescript
// Global feature definitions
const FEATURES = {
  ADVANCED_ANALYTICS: 'advanced_analytics',
  CSV_EXPORT: 'csv_export', 
  API_ACCESS: 'api_access',
  PREMIUM_MODERATION: 'premium_moderation',
} as const;

// Usage in both web and bot
const canUseFeature = await featureFlags.isEnabled(
  guildId, 
  FEATURES.ADVANCED_ANALYTICS
);
```

### **Database Schema**
```sql
-- Per-guild feature overrides
CREATE TABLE guild_features (
  guild_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, feature_name)
);

-- Global feature definitions with defaults
-- (Could be in code or separate table)
```

### **Implementation Pattern**
1. **Check order**: Guild override → Global default → Feature definition default
2. **Caching**: TTL cache for feature checks (5-10 minutes)
3. **Shared service**: Used by both web routes and Discord commands
4. **Admin interface**: Web UI to toggle features per guild

### **Features to Gate Initially**
- `csv_export` - Analytics data export
- `advanced_analytics` - Detailed scoring/charts
- `api_access` - Future API endpoints
- `premium_moderation` - Advanced automod features
- `unlimited_tracking` - Message history limits

This approach gives you flexibility for both global rollouts and per-customer enablement.