export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number = 500,
): Promise<T> {
  let currentRetry = 0;
  let lastError: Error | undefined;

  while (currentRetry < maxRetries) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      lastError = error;
      const delayMs = Math.pow(2, currentRetry) * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      currentRetry++;
    }
  }

  // TODO: subclass `Error` so we can add data bags, like all failures here

  throw lastError; // If all retries fail, rethrow the last error.
}

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
