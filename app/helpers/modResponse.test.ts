import { describe, expect, it } from "vitest";

import { getMostSevereResolution, resolutions } from "./modResponse.js";

describe("getMostSevereResolution", () => {
  it("returns most severe when given multiple resolutions", () => {
    expect(getMostSevereResolution([resolutions.track, resolutions.ban])).toBe(
      resolutions.ban,
    );

    expect(
      getMostSevereResolution([resolutions.timeout, resolutions.restrict]),
    ).toBe(resolutions.restrict);

    expect(
      getMostSevereResolution([
        resolutions.track,
        resolutions.kick,
        resolutions.timeout,
      ]),
    ).toBe(resolutions.kick);
  });

  it("returns the resolution when given a single resolution", () => {
    expect(getMostSevereResolution([resolutions.track])).toBe(
      resolutions.track,
    );
    expect(getMostSevereResolution([resolutions.ban])).toBe(resolutions.ban);
  });

  it("handles all resolutions being tied", () => {
    expect(
      getMostSevereResolution([
        resolutions.track,
        resolutions.timeout,
        resolutions.restrict,
        resolutions.kick,
        resolutions.ban,
      ]),
    ).toBe(resolutions.ban);
  });

  it("returns track for empty array", () => {
    expect(getMostSevereResolution([])).toBe(resolutions.track);
  });

  it("correctly orders all severity levels", () => {
    expect(getMostSevereResolution([resolutions.ban, resolutions.track])).toBe(
      resolutions.ban,
    );
    expect(
      getMostSevereResolution([resolutions.track, resolutions.timeout]),
    ).toBe(resolutions.timeout);
    expect(
      getMostSevereResolution([resolutions.timeout, resolutions.restrict]),
    ).toBe(resolutions.restrict);
    expect(
      getMostSevereResolution([resolutions.restrict, resolutions.kick]),
    ).toBe(resolutions.kick);
    expect(getMostSevereResolution([resolutions.kick, resolutions.ban])).toBe(
      resolutions.ban,
    );
  });
});
