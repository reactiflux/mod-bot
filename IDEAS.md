# some kind of invite management UI

spammer joining by invites is pretty hard to discover and manage. an interface for tidying up invites to protect members might be helpful

# "mod message" feature

use for other things too, like a role menu + vetting process
long-lived button to initialize
create a thread (private if possible) with the user
ask member to complete "application", onboarding-style series of responses maybe
create a thread in #mod-log and share application with application deets, with approve button

# admin onboarding and web experience

should have a web-based onboarding flow to configure server where necessary. hand off between discord bot and web as appropriate

- add to server
- configure features
  - reporting and restricting
  - moderation voting

# member onboarding

gate entire server behind having roles
"Why did you join the community?" prompt with corresponding roles, configurable via web app
set up with configurable questions + role options
allow for more than 1 prompt/role prompt
set it as required or optional. permissions here would be difficult to set up tho
introductions step before unlocking rest of server
https://discord.gg/gitpod has a good example of this with a custom bot
https://scrimba.com/ too

# billing

every ~ hour, report online count for every guild
hook in webhook updates for paid-ness. track billing status (can i unsubscrbe from gateway events by guild? no).
should make a convenient abstraction for enforcing order of handler execution/early exit of request chain. middleware-ish type interaction, so i can ensure billing checks are done and get a better way of not including moderated messages in metrics
can't query stripe by customer info, so will need to store IDs. sounds like a guild table column. on startup/guild event, check for customer ID and if not present, create+store one
what does the internal product stuff look like? 1 test/1 prod product? can i commit that to code somewhere to make it easier to describe the state of, and iterate on in the future?

# auth abstraction improvements

- use passport
- mvp/prototype role-based authorization
  - extend off server roles, copy discord UI

# internal karma system

track flow of conversation and assign various points to interactions. types of interactions:

- send a message
- create a thread
- reply
- react
- response marked as correct answer
  build it with a rules engine for determining score + log of events, so score can be determined at any point in time. idea being that this would be an evolving system, so an archive of how a score was determined is advantageous
  emit to amplitude or similar metrics system with embeddable charts. periodically evaluate db event log + rules to truncate and keep DB from growing without bound
  weight interaction score deltas by their own score

# better realtime spam handling

store wordlist in db
allow for manual "report as spam" function
begin iterating on discord server for the bot itself, as a major way for server operators to communicate back with me/each other
alert when messages/etc reach some threshold of being reported as spam
probably rate limit as well. too many messages too quickly, delete

# stored responses feature

simple db lookup for on slash command. `/storedresponse name` responds with something like our !commands in reactibot
