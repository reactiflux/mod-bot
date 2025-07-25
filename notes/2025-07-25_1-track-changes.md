Currently we post a new message to the designated "mod log" channel for every new message reported, logging who it was and creating a thread to discuss the message. Historically I've used the search box to track history, e.g. mentions:<userid> in:mod-log, but recently that's been breaking sometimes (perhaps as they optimize/break search indices).

We could instead move to a model where the entire moderation history for a user is captured in a single thread. This actually works really well for a couple of other benefits, like making this history easily discoverable by programmatic means without storing a complete duplicate of the records in our own database. We could store a thread lookup alongside a user record, and use that to retrieve message history for summary.

let's not do this but capturing it
This change would mean a database record like

user_id | guild_id | thread_id | created_at | expires (?)
Behavior within the thread would be similar to now, with a thread consisting of member reports and moderator actions. We should add in logs for timeouts as well, and try to capture kicks/bans not initiated through Euno features.

Outside of the thread, we should post a new top-level message linking back to the thread when any new reports come in. Perhaps it would make sense to keep the same "new report" message format, and forward it back to the top level channel.
