export const resolutions = {
  track: "track",
  // warning: "formalWarning",
  timeout: "timeout",
  restrict: "restrict",
  kick: "kick",
  ban: "ban",
} as const;
export const humanReadableResolutions = {
  [resolutions.track]: "No action (abstain)",
  // [resolutions.warning]: "Formal Warning",
  [resolutions.timeout]: "Timeout Overnight",
  [resolutions.restrict]: "Restrict",
  [resolutions.kick]: "Kick",
  [resolutions.ban]: "Ban",
} as const;
export type Resolution = (typeof resolutions)[keyof typeof resolutions];

const severityOrder: Resolution[] = [
  resolutions.track,
  resolutions.timeout,
  resolutions.restrict,
  resolutions.kick,
  resolutions.ban,
];

export function getMostSevereResolution(
  resolutionList: Resolution[],
): Resolution {
  // Defensive: return track if empty (shouldn't happen in practice)
  if (resolutionList.length === 0) {
    return resolutions.track;
  }

  let mostSevere = resolutionList[0];
  let highestIndex = severityOrder.indexOf(mostSevere);

  for (const resolution of resolutionList) {
    const index = severityOrder.indexOf(resolution);
    if (index > highestIndex) {
      highestIndex = index;
      mostSevere = resolution;
    }
  }

  return mostSevere;
}

export const votingStrategies = {
  simple: "simple",
  majority: "majority",
} as const;
export type VotingStrategy =
  (typeof votingStrategies)[keyof typeof votingStrategies];
