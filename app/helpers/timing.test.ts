import { retry, sleep } from "./timing";

describe("retry function", () => {
  it("should succeed after a few retries", async () => {
    let attempt = 0;

    async function fetchData() {
      if (attempt < 3) {
        attempt++;
        throw new Error("Failed to fetch data");
      }
      return "Data fetched successfully";
    }

    const result = await retry(fetchData, 5, 100);
    expect(result).toBe("Data fetched successfully");
  });

  it("should throw an error after max retries", async () => {
    async function alwaysFails() {
      throw new Error("Always fails");
    }

    let didThrow = false;
    try {
      await retry(alwaysFails, 3, 100);
    } catch (error) {
      didThrow = true;
    }
    expect(didThrow).toBe(true);
  });
});

describe("sleep function", () => {
  it("should delay for the specified amount of time", async () => {
    const startTime = Date.now();
    const delayMs = 1000; // 1 second

    await sleep(delayMs);

    const endTime = Date.now();
    const actualDelay = endTime - startTime;

    // Allow some tolerance due to potential timer inaccuracies
    const toleranceMs = 50;

    expect(actualDelay).toBeGreaterThanOrEqual(delayMs - toleranceMs);
    expect(actualDelay).toBeLessThanOrEqual(delayMs + toleranceMs);
  });
});
