# E2E Testing with Playwright

This project uses Playwright for end-to-end testing with real Discord authentication.

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   npx playwright install
   ```

2. **Capture real Discord authentication (one-time setup):**

   ```bash
   npm run capture-auth
   ```

   This will:

   - Open Discord OAuth in your browser
   - Guide you through the auth flow
   - Capture a real auth token and store it in the database
   - Save auth data to `test-auth-data.json` (ignored by git)

## Running Tests

### Basic Tests (no auth required)

```bash
npm run test:e2e                 # Run all basic tests
npm run test:e2e:ui               # Run with Playwright UI
npm run test:e2e:headed           # Run in headed mode (visible browser)
```

### Authenticated Tests (automatic real auth)

```bash
npm run test:e2e                 # Uses real Discord tokens if available, mock data if not
FORCE_AUTH_TESTS=1 npm run test:e2e   # Run including real auth tests (legacy)
```

### Using Real Auth in Your Tests

The auth helpers now automatically use real Discord tokens when available:

```typescript
import { createTestUser, createRealTestUser } from "../helpers/auth";

// This will use real Discord tokens if available, mock data if not
const user = await createTestUser();

// This requires real Discord tokens and will throw an error if not available
const realUser = await createRealTestUser();
```

## Test Structure

### Basic Tests (no auth required)

- **`landing-page.spec.ts`** - Tests unauthenticated landing page
- **`health-check.spec.ts`** - Tests health check endpoint
- **`navigation.spec.ts`** - Tests basic routing
- **`auth-flow.spec.ts`** - Tests auth flow protection (without real OAuth)

### Authenticated Tests (requires real Discord token)

- **`real-auth-flows.spec.ts`** - Tests authenticated features using real Discord tokens

## How It Works

### Auth Capture Script (`scripts/capture-auth.js`)

1. Starts a temporary callback server on port 3001
2. Opens Discord OAuth in your browser
3. Captures the authorization code when you complete the flow
4. Exchanges it for a real Discord access token
5. Creates a user in the database and stores the token
6. Saves auth data to `test-auth-data.json`

### Auth Helpers

#### Real Auth Helper (`tests/helpers/real-auth.ts`)

- `loadCapturedAuthData()` - Loads the captured auth data
- `createRealAuthSession()` - Creates session cookies using real tokens
- `hasValidCapturedAuth()` - Checks if captured auth is available and valid
- `getCapturedUserInfo()` - Gets user info from captured auth

#### Main Auth Helper (`tests/helpers/auth.ts`)

- `createTestUser()` - **Now automatically uses real Discord tokens when available**, falls back to mock data
- `createTestAdmin()` - **Now automatically uses real Discord tokens when available**, falls back to mock data
- `createRealTestUser()` - **New function** that requires real Discord tokens (throws error if not available)
- `createSessionForUser()` - Creates session cookies for an existing user ID
- `cleanupTestUsers()` - Cleans up test users from the database

### Benefits of This Approach

- ✅ **Real authentication** - Uses actual Discord OAuth tokens
- ✅ **Automatic fallback** - Tests automatically use real tokens when available, mock data when not
- ✅ **No external dependencies** - Doesn't require mock servers or Discord app simulation
- ✅ **Reliable** - No hanging processes or external app conflicts
- ✅ **Secure** - Auth data is stored locally and ignored by git
- ✅ **Flexible** - Can test both authenticated and unauthenticated flows
- ✅ **Backward compatible** - Existing tests work without changes

## Troubleshooting

### "No captured auth data found"

Run `npm run capture-auth` to authenticate with Discord first.

### "Captured session no longer exists"

The session expired or was cleared. Run `npm run capture-auth` again.

### Tests still show login screens

Make sure you set `FORCE_AUTH_TESTS=1` when running authenticated tests, and verify the auth data exists:

```bash
ls -la test-auth-data.json
```

### Auth capture fails

- Make sure your Discord app is configured correctly in `.env`
- Check that port 3001 is available
- Verify your Discord app's redirect URI includes `http://localhost:3001/callback`

### Environment variables not loading

If you see errors about missing Discord credentials:

- Ensure `.env` file exists in the project root: `ls -la .env`
- Check the file contains required variables: `cat .env.example`
- Try running tests explicitly with env: `dotenv -e .env -- npm run test:e2e`

## Security Notes

- `test-auth-data.json` contains real Discord tokens and is ignored by git
- The capture script only requests minimal Discord permissions (`identify email guilds`)
- Auth data expires after 7 days and can be regenerated anytime
- Only use this for local development and testing
