export const difference = <T>(a: Set<T>, b: Set<T>) =>
  new Set(Array.from(a).filter((x) => !b.has(x)));

/**
 * Returns the intersection of two sets - elements that exist in both sets
 * @param setA First set
 * @param setB Second set
 * @returns A new Set containing elements present in both input sets
 */
export function intersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  const result = new Set<T>();

  for (const elem of setA) {
    if (setB.has(elem)) {
      result.add(elem);
    }
  }

  return result;
}

/**
 * Returns the complement (difference) of two sets - elements in setA that are not in setB
 * @param setA First set
 * @param setB Second set
 * @returns A new Set containing elements present in setA but not in setB
 */
export function complement<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  const result = new Set<T>();

  for (const elem of setA) {
    if (!setB.has(elem)) {
      result.add(elem);
    }
  }

  return result;
}
