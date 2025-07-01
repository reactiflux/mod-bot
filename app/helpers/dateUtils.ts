/**
 * Generate a date range between start and end dates in YYYY-MM-DD format
 */
export const generateDateRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const currentDate = new Date(start);

  while (currentDate <= new Date(end)) {
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
  return dateRange.map((date) => {
    return (
      dateToEntryMap[date] ||
      ({
        date,
        ...zeroTemplate,
      } as T)
    );
  });
};
