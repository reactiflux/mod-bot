import {
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponent,
} from "discord.js";

import { resolutions } from "#~/helpers/modResponse";

import type { Escalation } from "./service";
import {
  buildConfirmedMessageComponents,
  buildVoteMessageComponents,
  buildVotesListContent,
} from "./strings";
import { tallyVotes, type VoteTally } from "./voting";

const emptyTally: VoteTally = tallyVotes([]);

// Helper to create mock escalation objects for testing
function createMockEscalation(overrides: Partial<Escalation> = {}): Escalation {
  const createdAt = new Date("2024-01-01T12:00:00Z").toISOString();
  const scheduledFor = new Date("2024-01-02T12:00:00Z").toISOString(); // 24h later
  return {
    id: "test-escalation-id",
    guild_id: "test-guild",
    thread_id: "test-thread",
    vote_message_id: "test-message",
    reported_user_id: "123456789",
    initiator_id: "987654321",
    flags: JSON.stringify({ quorum: 3 }),
    created_at: createdAt,
    resolved_at: null,
    resolution: null,
    voting_strategy: null,
    scheduled_for: scheduledFor,
    ...overrides,
  };
}

/**
 * Extract all text content from a ContainerBuilder's serialized components.
 */
function extractText(
  container: ReturnType<typeof buildVoteMessageComponents>,
): string {
  const json = container.toJSON();
  const texts: string[] = [];
  for (const component of json.components) {
    if (component.type === ComponentType.TextDisplay) {
      // TextDisplay
      texts.push((component as { content: string }).content);
    }
  }
  return texts.join("\n");
}

/**
 * Extract button labels from a ContainerBuilder's serialized components.
 */
function extractButtonLabels(
  container: ReturnType<typeof buildVoteMessageComponents>,
): string[] {
  const json = container.toJSON();
  const labels: string[] = [];
  for (const component of json.components) {
    if (component.type === ComponentType.ActionRow) {
      for (const child of (
        component as APIActionRowComponent<APIButtonComponent>
      ).components) {
        if (child.type === ComponentType.Button && "label" in child) {
          labels.push(child.label!);
        }
      }
    }
  }
  return labels;
}

describe("buildVotesListContent", () => {
  it("returns empty string for no votes", () => {
    const result = buildVotesListContent(emptyTally);
    expect(result).toBe("");
  });

  it("lists votes with voter mentions", () => {
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.ban, voter_id: "user2" },
    ]);
    const result = buildVotesListContent(tally);

    expect(result).toContain("Ban");
    expect(result).toContain("<@user1>");
    expect(result).toContain("<@user2>");
  });

  it("lists multiple resolutions", () => {
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "user1" },
      { vote: resolutions.kick, voter_id: "user2" },
    ]);
    const result = buildVotesListContent(tally);

    expect(result).toContain("Ban");
    expect(result).toContain("Kick");
  });

  it("uses small text formatting", () => {
    const tally = tallyVotes([{ vote: resolutions.track, voter_id: "mod1" }]);
    const result = buildVotesListContent(tally);

    expect(result).toContain("-#");
  });
});

describe("buildVoteMessageComponents", () => {
  const modRoleId = "564738291";

  it("shows vote count toward quorum", () => {
    const escalation = createMockEscalation();
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
      [],
      false,
    );
    const text = extractText(container);

    expect(text).toMatch(/0 vote.*quorum at 3/);
    expect(text).not.toMatch("null");
  });

  it("mentions the reported user", () => {
    const escalation = createMockEscalation();
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
      [],
      false,
    );
    const text = extractText(container);

    expect(text).toContain(`<@${escalation.reported_user_id}>`);
  });

  it("shows quorum reached status when votes >= quorum", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      tally,
      [],
      false,
    );
    const text = extractText(container);

    expect(text).toContain("Quorum reached");
    expect(text).toContain("Ban");
  });

  it("shows tied status when quorum reached but tied", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
      { vote: resolutions.kick, voter_id: "u4" },
      { vote: resolutions.kick, voter_id: "u5" },
      { vote: resolutions.kick, voter_id: "u6" },
    ]);
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      tally,
      [],
      false,
    );
    const text = extractText(container);

    expect(text).toContain("Tied between");
    expect(text).toContain("tiebreaker");
  });

  it("includes Discord timestamp", () => {
    const escalation = createMockEscalation();
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
      [],
      false,
    );
    const text = extractText(container);

    expect(text).toMatch(/<t:\d+:R>/);
  });

  it("includes vote buttons", () => {
    const escalation = createMockEscalation();
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
      [],
      false,
    );
    const labels = extractButtonLabels(container);

    expect(labels).toContain("No action (abstain)");
    expect(labels).toContain("Ban");
    expect(labels).toContain("Kick");
  });

  it("includes upgrade button for simple strategy", () => {
    const escalation = createMockEscalation();
    const container = buildVoteMessageComponents(
      modRoleId,
      "simple",
      escalation,
      emptyTally,
      [],
      false,
    );
    const labels = extractButtonLabels(container);

    expect(labels).toContain("Require majority vote");
  });

  it("omits upgrade button for majority strategy", () => {
    const escalation = createMockEscalation();
    const container = buildVoteMessageComponents(
      modRoleId,
      "majority",
      escalation,
      emptyTally,
      [],
      false,
    );
    const labels = extractButtonLabels(container);

    expect(labels).not.toContain("Require majority vote");
  });
});

describe("buildConfirmedMessageComponents", () => {
  it("shows the confirmed resolution", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const container = buildConfirmedMessageComponents(
      escalation,
      resolutions.ban,
      tally,
    );
    const text = extractText(container);

    expect(text).toContain("Ban");
    expect(text).toContain("✅");
  });

  it("mentions the reported user", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.kick, voter_id: "u1" },
      { vote: resolutions.kick, voter_id: "u2" },
      { vote: resolutions.kick, voter_id: "u3" },
    ]);
    const container = buildConfirmedMessageComponents(
      escalation,
      resolutions.kick,
      tally,
    );
    const text = extractText(container);

    expect(text).toContain(`<@${escalation.reported_user_id}>`);
  });

  it("shows execution timestamp", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.track, voter_id: "u1" },
      { vote: resolutions.track, voter_id: "u2" },
      { vote: resolutions.track, voter_id: "u3" },
    ]);
    const container = buildConfirmedMessageComponents(
      escalation,
      resolutions.track,
      tally,
    );
    const text = extractText(container);

    expect(text).toContain("Executes");
    expect(text).toMatch(/<t:\d+:R>/);
  });

  it("includes vote record", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.restrict, voter_id: "mod1" },
      { vote: resolutions.restrict, voter_id: "mod2" },
      { vote: resolutions.kick, voter_id: "mod3" },
    ]);
    const container = buildConfirmedMessageComponents(
      escalation,
      resolutions.restrict,
      tally,
    );
    const text = extractText(container);

    expect(text).toContain("<@mod1>");
    expect(text).toContain("<@mod2>");
    expect(text).toContain("<@mod3>");
  });

  it("includes expedite button", () => {
    const escalation = createMockEscalation();
    const tally = tallyVotes([
      { vote: resolutions.ban, voter_id: "u1" },
      { vote: resolutions.ban, voter_id: "u2" },
      { vote: resolutions.ban, voter_id: "u3" },
    ]);
    const container = buildConfirmedMessageComponents(
      escalation,
      resolutions.ban,
      tally,
    );
    const labels = extractButtonLabels(container);

    expect(labels).toContain("Expedite");
  });
});
