# Escalation Feature Testing Challenges

The voting strategy feature presents significant testing challenges due to its deep integration with Discord's API, time-dependent behavior,
and complex multi-actor workflows. This report analyzes these challenges and proposes practical solutions for effective testing.

## Challenges

### Discord API Dependency

Challenge 1:

The EscalationHandlers interact heavily with Discord.js types (MessageComponentInteraction, ButtonBuilder, etc.):

- Vote handler requires interaction.guildId, interaction.customId, interaction.user.id
- Calls interaction.reply(), interaction.update(), interaction.deferReply()
- Fetches guild settings, mod roles, and member permissions
- Sends/edits messages in Discord channels
- Mocking all required properties and methods is verbose and brittle

Current State

- Existing e2e tests (tests/e2e/mocks/discord.ts) only mock REST API endpoints for web flows
- No infrastructure for mocking Discord.js gateway/interaction objects
- No unit tests for handlers—only for pure functions (tallyVotes, buildVoteMessageContent)

### Time-Dependent Behavior

Challenge 2:

- The auto-resolution system depends on elapsed time
- No mechanism to inject time or fast-forward in tests
- The escalationResolver scheduler runs every 15 minutes in production

### Multi-Actor Workflows

Challenge 3:

Real voting scenarios involve multiple moderators interacting sequentially:

1.  Mod A escalates → creates vote
2.  Mod B votes "ban"
3.  Mod C votes "kick"
4.  Mod D votes "ban" → triggers quorum (simple strategy)
5.  OR: Mod E clicks "Require majority vote" → changes strategy, cancels scheduled resolution

### Database + External Service Coordination

Challenge 4:

A single vote operation:

1.  Reads from escalations table (get escalation)
2.  Writes to escalation_records table (record vote)
3.  Reads escalation_records again (tally votes)
4.  Reads guild settings from guilds table
5.  Calls Discord API to update message

- Need real database for integration tests (existing DbFixture helps)
- Discord API calls must be mocked/stubbed

## Proposed Solutions

([see #211 for more information on solutions](https://github.com/reactiflux/mod-bot/issues/211#issuecomment-3635336824))

### Extract Pure Business Logic

Solution 1:

Separate decision logic from Discord I/O.

Benefits:

- Test all voting logic permutations without Discord mocks
- 100+ test cases possible in milliseconds
- Clear separation of concerns

Files to create:

- `app/commands/escalate/voting-logic.ts` - pure functions
- `app/commands/escalate/voting-logic.test.ts` - comprehensive tests

### Time Abstraction

Solution 2:

Approach: Inject time provider for testability

Benefits:

- Test timeout logic without waiting
- Verify edge cases (exactly at timeout, 1ms before, etc.)

---

Solution 4: Integration Test Fixtures

Approach: Extend DbFixture for escalation testing

// tests/e2e/fixtures/escalation.ts
export class EscalationFixture {
constructor(private db: DbFixture) {}

async createEscalation(options: {
guildId: string;
votingStrategy?: VotingStrategy;
votes?: Array<{ resolution: Resolution; voterId: string }>;
createdAt?: string; // Allow backdating for timeout tests
}): Promise<Escalation> {
// Insert escalation and votes
}

async addVote(escalationId: string, vote: Resolution, voterId: string) {
// Insert vote record
}

async getEscalationState(id: string): Promise<{
escalation: Escalation;
votes: VoteRecord[];
tally: VoteTally;
}> {
// Retrieve current state for assertions
}
}

Benefits:

- Reusable test setup
- Database-backed integration tests
- Verify real persistence behavior
