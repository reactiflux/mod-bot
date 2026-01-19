export interface EscalationFlags {
  quorum: number;
}

export function parseFlags(flagsJson: string): EscalationFlags {
  try {
    return JSON.parse(flagsJson) as EscalationFlags;
  } catch {
    return { quorum: 3 }; // Default
  }
}

/**
 * Calculate hours until auto-resolution based on vote count. The goal is to
 * provide enough time for all mods to weigh in.
 */
export function calculateTimeoutHours(voteCount: number): number {
  return Math.max(0, 36 - 4 * voteCount);
}

/**
 * Check if an escalation should auto-resolve based on time elapsed.
 */
export function shouldAutoResolve(
  createdAt: string,
  voteCount: number,
): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const hoursElapsed = (now - created) / (1000 * 60 * 60);
  const timeoutHours = calculateTimeoutHours(voteCount);

  return hoursElapsed >= timeoutHours;
}

/**
 * Calculate the scheduled resolution time based on creation time and vote count.
 */
export function calculateScheduledFor(
  createdAt: string,
  voteCount: number,
): string {
  const timeoutHours = calculateTimeoutHours(voteCount);
  const scheduledFor = new Date(
    new Date(createdAt).getTime() + timeoutHours * 60 * 60 * 1000,
  );
  return scheduledFor.toISOString();
}
