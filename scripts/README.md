# Payment Flow Testing Scripts

## Overview

These scripts provide automated testing for the Euno payment flow using HTTP assertions.

## Files

- `test-payment-flow.sh` - Main testing script
- `test-example.sh` - Example usage with sample session data
- `README.md` - This documentation

## Usage

### Quick Start

1. Get valid session cookies by logging into the app
2. Set environment variables:

```bash
export COOKIE_SESSION="__client-session=your_cookie_here"
export DB_SESSION="__session=your_db_session_here"
```

3. Run the tests:

```bash
./scripts/test-payment-flow.sh
```

### Getting Session Cookies

To get session cookies, you can:

1. Log into the app normally through Discord OAuth
2. Check browser dev tools for the cookies
3. Or add temporary logging to session.server.ts (as done in completeOauthLogin)

### What Gets Tested

#### 🔐 Authentication & Security

- Landing page accessibility
- Auth protection on protected routes
- Parameter validation and error handling

#### 🎯 Onboard Flow

- Free guild shows "Pro vs Free" choice
- Pro guild shows congratulatory experience
- Proper visual hierarchy (Pro marked as "Recommended")

#### 💳 Payment Flow

- Upgrade page renders correctly
- Payment success updates database subscription
- Payment cancel shows retry options
- Database state changes correctly

#### 🔍 OAuth Integration

- OAuth flow redirects to Discord correctly
- Proper bot permissions included
- Correct scopes for bot installation

#### 📊 Error Handling

- Missing parameters return 400 errors
- Invalid routes redirect to login
- Graceful error responses

### Example Output

```
🧪 Euno Payment Flow Integration Test
======================================
📋 Setting up test data...
  ✅ Created test guild: test-guild-free-1234 (free)
  ✅ Created test guild: test-guild-pro-1234 (paid)

🔐 Testing Authentication & Landing Pages
----------------------------------------
Testing: GET /
  ✅ Status: 200
  ✅ Content: Found 'Add to Discord Server'

🎯 Testing Onboard Flow
----------------------
Testing: GET /onboard?guild_id=test-guild-free-1234
  ✅ Status: 200
  ✅ Content: Found 'Euno is now active'

[... continues with all tests ...]

🎉 All tests completed successfully!
Payment flow is working correctly and ready for production.
```

### Configuration Options

- `BASE_URL` - Server to test (default: http://localhost:3000)
- `DB_FILE` - Database file location (default: ./mod-bot.sqlite3)

### Test Data

The script automatically:

- Creates temporary test guilds with different subscription tiers
- Tests database operations with these guilds
- Cleans up all test data when complete

### Assertions Made

1. **HTTP Status Codes** - Ensures routes return expected status
2. **Content Verification** - Checks key UI elements are present
3. **Database State** - Verifies subscription changes persist
4. **Redirect Behavior** - Confirms OAuth and auth flows work
5. **Error Responses** - Validates proper error handling

This provides confidence that the payment flow works end-to-end before deploying to production.
