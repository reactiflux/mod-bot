/**
 * Generate a date range between start and end dates in YYYY-MM-DD format
 * Ensures proper date parsing and handles edge cases
 */
export const generateDateRange = (start: string, end: string): string[] => {
  const dates: string[] = [];

  // Parse dates and normalize to start of day to avoid timezone issues
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error("Invalid date format provided to generateDateRange");
  }

  const currentDate = new Date(startDate);

  // Include both start and end dates in the range
  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

/**
 * Fill date gaps in daily breakdown data with zero values
 * This ensures charts render correctly with gaps filled
 */
export const fillDateGaps = <T extends { date: string }>(
  data: T[],
  startDate: string,
  endDate: string,
  zeroTemplate: Omit<T, "date">,
): T[] => {
  const dateRange = generateDateRange(startDate, endDate);
  const dateToEntryMap: Record<string, T> = {};

  // Map existing entries by date
  data.forEach((entry) => {
    dateToEntryMap[entry.date] = entry;
  });

  // Fill missing dates with zeroed-out data
  return dateRange.map((date) => ({ date, ...zeroTemplate }) as T);
};
