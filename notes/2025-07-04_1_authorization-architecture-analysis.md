# Authorization Architecture Analysis

## Current Authentication System

### Session Management

- **Dual Session Architecture**: Uses both cookie-based and database-based sessions
  - Cookie session: Stores minimal data directly in encrypted cookie
  - Database session: Stores sensitive data (Discord tokens) in database with session ID
- **Session Models**:
  - `CookieSession`: Lightweight, stores basic info
  - `DbSession`: Secure storage for Discord tokens and OAuth state
- **Security**: Discord tokens never stored in cookies, only in database

### OAuth Flow

- **Discord OAuth Integration**: Complete OAuth2 flow with multiple modes
  - User flow: Standard user authentication
  - Bot flow: Bot installation with permissions
  - Signup flow: New user registration
- **State Management**: Uses UUID-based state parameter for CSRF protection
- **Scopes**:
  - User: `identify email guilds guilds.members.read`
  - Bot: `identify email guilds guilds.members.read bot applications.commands`

### Current Authorization Patterns

#### User Authentication

- **User Model**: Basic user entity with Discord external ID
- **Session Functions**:
  - `getUser()`: Get current user from session
  - `requireUser()`: Enforce authentication, redirect to login if needed
  - `requireUserId()`: Get user ID with authentication check

#### Guild-Based Authorization

- **Guild Permissions**: Discord permission-based authorization
- **Permission Mapping**:
  - `MOD`: ModerateMembers permission
  - `ADMIN`: Administrator permission
  - `MANAGER`: ManageChannels, ManageGuild, or ManageRoles permissions
  - `MANAGE_CHANNELS`: ManageChannels permission
  - `MANAGE_GUILD`: ManageGuild permission
  - `MANAGE_ROLES`: ManageRoles permission

#### Guild Access Control

- **Guild Filtering**:
  - Users can only access guilds where they have `MANAGER` level permissions
  - Bot must be installed in guild for management access
- **Authorization Array**: Each guild has `authz` array with user's permissions
- **Caching**: TTL cache (5 min) for guild data to reduce Discord API calls

### Database Schema

#### Users Table

```sql
- id: UUID (primary key)
- email: text
- externalId: text (Discord user ID)
- authProvider: text (default: "discord")
```

#### Sessions Table

```sql
- id: UUID (primary key)
- data: JSON (session data)
- expires: datetime
```

#### Guilds Table

```sql
- id: string (Discord guild ID)
- settings: JSON (guild configuration)
```

#### Guild Subscriptions Table

```sql
- guild_id: string (primary key)
- stripe_customer_id: text
- stripe_subscription_id: text
- product_tier: text (default: "free")
- status: text (default: "active")
- current_period_end: datetime
- created_at: datetime
- updated_at: datetime
```

### Current Access Control Mechanisms

#### Route-Level Protection

- **Auth Layout**: `__auth.tsx` enforces authentication for protected routes
- **User Requirement**: Routes under auth layout require valid user session
- **Guild Context**: Guild-specific routes include guild ID in URL parameters

#### Permission Checking

- **Discord Permissions**: Leverages Discord's native permission system
- **Guild Membership**: Validates user membership and permissions in target guild
- **Bot Presence**: Requires bot installation for management features

#### Subscription-Based Access

- **Product Tiers**: Free vs. Paid tiers
- **Feature Gating**: `SubscriptionService.hasFeature()` (currently returns false)
- **Subscription Status**: Active/inactive subscription management

### Current Gaps and Limitations

#### Missing Role-Based Access Control

- No internal role system beyond Discord permissions
- No fine-grained feature permissions
- No user role management interface

#### Limited Authorization Middleware

- No declarative permission decorators
- No middleware for route-level permission checks
- Manual permission validation in loaders

#### No Audit Trail

- No logging of permission changes
- No access attempt tracking
- Limited observability for authorization decisions

#### Feature Flag System

- Subscription service exists but feature checking is stubbed
- No granular feature control
- No A/B testing or gradual rollouts

#### Guild-Level Permissions

- Guild settings stored as JSON blob
- No structured permission model for guild features
- No delegation of permissions to non-admin users

### Current Authorization Flow

1. **User Authentication**: Discord OAuth → User creation/retrieval → Session establishment
2. **Guild Authorization**: Fetch user's guilds → Filter by permissions → Cache results
3. **Route Access**: Check session → Validate guild access → Load guild-specific data
4. **Feature Access**: Check subscription tier → Validate feature access (stubbed)

### Strengths

- Secure Discord integration with proper token handling
- Caching layer for performance
- Subscription management foundation
- Clean separation of cookie vs. database sessions

### Areas for Extension

- Role-based access control system
- Permission middleware and decorators
- Feature flag implementation
- Audit logging
- Guild-level permission delegation
- Fine-grained resource access control
