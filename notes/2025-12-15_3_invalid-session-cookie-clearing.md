# Invalid Session Cookie Clearing

## Problem

When session cookies were invalid (expired database sessions, corrupted cookies, tampered data), React Router's session utilities (`getCookieSession`, `getDbSession`) silently return new empty sessions without clearing the invalid cookies from the client. This caused:

- Repeated failed session lookups on every request
- Client kept sending bad cookies indefinitely
- No way for the user to get a clean slate without manually clearing cookies

## Solution

Modified `getUserId()` in `session.server.ts` to detect when:
1. Session cookies are present in the request (`__session` or `__client-session`)
2. But no valid userId was found in the session

When this condition is detected, we call `logout(request)` which:
- Destroys both session cookies (sets them to expire)
- Redirects to `/`

This clears invalid cookies in a single location that all session-checking code paths flow through (`getUser`, `requireUserId`, `requireUser`).

## Implementation

Added `hasCookie(request, cookieName)` helper to check for cookie presence without parsing, then added a check in `getUserId()`:

```typescript
if (!userId) {
  const hasSessionCookie = hasCookie(request, "__session");
  const hasClientSessionCookie = hasCookie(request, "__client-session");
  if (hasSessionCookie || hasClientSessionCookie) {
    throw await logout(request);
  }
}
```