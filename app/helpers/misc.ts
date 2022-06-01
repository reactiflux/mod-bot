export const sleep = (seconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(() => resolve(), seconds * 1000);
  });

export const retry = async <T>(
  count: number,
  func: (count: number, max: number) => T,
) => {
  let lastError;
  for (let i = 0; i < count; i++) {
    try {
      return await func(i, count);
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }
      lastError = e;
    }
  }
  throw lastError as Error;
};
