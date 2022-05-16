auth uses 2 sessions: cookie-based where data is right in the cookie, and db-based, where a token is used as id for an associated db row.
login POSTs to /auth, which creates a `state` in the db to use for added security on discord auth. never communicated to the client
discord refresh token is likewise only ever stored in the db, never in a cookie session. discord tokens are highly sensitive, with many phishing scams and hacks.
