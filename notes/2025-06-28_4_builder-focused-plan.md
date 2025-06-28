# Builder-Focused Action Plan - 2025-06-28

## Core Technical Gaps to Address

### 1. Multi-tenancy Architecture (Priority 1)
**Current**: Single guild deployment
**Needed**: Support multiple Discord servers per instance
- Database schema isolation by guild_id
- Service layer refactoring for tenant separation
- Configuration management per guild

### 2. Streamlined Onboarding Flow (Priority 2)
**Current**: Manual setup commands requiring technical knowledge
**Needed**: One-click Discord bot installation
- Discord OAuth flow for server owners
- Automated bot invitation with proper permissions
- Replace `/setup` command with guided web UI
- Auto-detect server structure and suggest configuration

### 3. Web Dashboard Accessibility (Priority 3)
**Current**: Auth system exists but dashboard features limited
**Needed**: Full-featured web interface for server owners
- Expose analytics dashboard with proper auth
- Real-time activity monitoring
- User management interface
- Configuration panels for moderation settings

### 4. Usage Limits & Gating (Priority 4)
**Current**: No usage restrictions
**Needed**: Basic feature gating for future monetization
- Message tracking limits
- Analytics export restrictions
- Premium feature flags in codebase
- Usage monitoring infrastructure

## Technical Implementation Order

1. **Guild isolation** - Critical for scaling beyond single server
2. **Web onboarding** - Removes biggest friction point
3. **Dashboard polish** - Your main differentiator vs other mod bots
4. **Feature gating** - Foundation for any future business model

## Key Architecture Decisions Needed
- How to handle guild data isolation in SQLite vs. moving to Postgres
- Whether to keep single deployment vs. multi-instance architecture
- How to structure the OAuth flow and permission scopes
- What to do about the AGPL license if commercializing

Want to start with multi-tenancy architecture first?