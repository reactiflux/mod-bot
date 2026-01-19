import type { Client } from "discord.js";

import { checkPendingEscalationsEffect } from "#~/commands/escalate/escalationResolver";
import { getFailure, runEscalationEffect } from "#~/commands/escalate/index";
import { log } from "#~/helpers/observability";
import { scheduleTask } from "#~/helpers/schedule";

const ONE_MINUTE = 60 * 1000;

/**
 * Check pending escalations using Effect-based resolver.
 */
async function checkPendingEscalations(client: Client): Promise<void> {
  const exit = await runEscalationEffect(checkPendingEscalationsEffect(client));

  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationResolver", "Failed to check pending escalations", {
      error: String(error),
    });
  }
}

/**
 * Start the escalation resolver scheduler.
 * Runs every 15 minutes to check for escalations that should be auto-resolved.
 */
export function startEscalationResolver(client: Client): void {
  log(
    "info",
    "EscalationResolver",
    "Starting escalation resolver scheduler",
    {},
  );

  scheduleTask("EscalationResolver", ONE_MINUTE * 15, () => {
    void checkPendingEscalations(client);
  });
}
