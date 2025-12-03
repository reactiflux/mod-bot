import { vi } from "vitest";

vi.mock("#~/helpers/observability", () => ({
  log: () => {
    /* nothing */
  },
}));
