export const resolutions = {
  track: "track",
  // warning: "formalWarning",
  timeout: "timeout",
  restrict: "restrict",
  kick: "kick",
  ban: "ban",
} as const;
export const humanReadableResolutions = {
  [resolutions.track]: "No action",
  // [resolutions.warning]: "Formal Warning",
  [resolutions.timeout]: "Timeout Overnight",
  [resolutions.restrict]: "Restrict",
  [resolutions.kick]: "Kick",
  [resolutions.ban]: "Ban",
} as const;
export type Resolution = (typeof resolutions)[keyof typeof resolutions];
