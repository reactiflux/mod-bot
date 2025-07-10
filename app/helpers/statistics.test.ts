import { describe, it, expect } from "vitest";
import {
  descriptiveStats,
  correlation,
  linearRegression,
  zScore,
  percentile,
  outliers,
  movingAverage,
  histogram,
  confidence,
  tTest,
} from "./statistics";

describe("statistics helpers", () => {
  const sampleData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const smallData = [1, 2, 3];

  describe("descriptiveStats", () => {
    it("calculates basic statistics correctly", () => {
      const stats = descriptiveStats(sampleData);

      expect(stats.mean).toBe(5.5);
      expect(stats.median).toBe(5.5);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.count).toBe(10);
      expect(stats.sum).toBe(55);
      expect(stats.range).toBe(9);
    });

    it("throws error for empty data", () => {
      expect(() => descriptiveStats([])).toThrow(
        "Cannot calculate statistics for empty dataset",
      );
    });
  });

  describe("correlation", () => {
    it("calculates correlation correctly", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const result = correlation(x, y);

      expect(result.coefficient).toBeCloseTo(1, 10);
      expect(result.direction).toBe("positive");
      expect(result.strength).toBe("very strong");
    });

    it("throws error for mismatched array lengths", () => {
      expect(() => correlation([1, 2], [1, 2, 3])).toThrow(
        "Arrays must have the same length",
      );
    });
  });

  describe("linearRegression", () => {
    it("calculates linear regression correctly", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const result = linearRegression(x, y);

      expect(result.slope).toBe(2);
      expect(result.intercept).toBe(0);
      expect(result.predict(6)).toBe(12);
    });

    it("throws error for insufficient data points", () => {
      expect(() => linearRegression([1], [2])).toThrow(
        "Need at least 2 data points for regression",
      );
    });
  });

  describe("zScore", () => {
    it("calculates z-score correctly", () => {
      const score = zScore(7, 5, 2);
      expect(score).toBe(1);
    });

    it("throws error for zero standard deviation", () => {
      expect(() => zScore(5, 5, 0)).toThrow(
        "Standard deviation cannot be zero",
      );
    });
  });

  describe("percentile", () => {
    it("calculates percentiles correctly", () => {
      const p50 = percentile(sampleData, 0.5);
      const p25 = percentile(sampleData, 0.25);

      expect(p50).toBe(5.5);
      expect(p25).toBeCloseTo(3.25, 0);
    });

    it("throws error for invalid percentile values", () => {
      expect(() => percentile(sampleData, 1.5)).toThrow(
        "Percentile must be between 0 and 1",
      );
      expect(() => percentile(sampleData, -0.1)).toThrow(
        "Percentile must be between 0 and 1",
      );
    });
  });

  describe("outliers", () => {
    it("detects outliers using IQR method", () => {
      const dataWithOutliers = [1, 2, 3, 4, 5, 100];
      const result = outliers(dataWithOutliers, "iqr");

      expect(result).toContain(100);
    });

    it("detects outliers using z-score method", () => {
      const dataWithOutliers = [1, 2, 3, 4, 5, 100];
      const result = outliers(dataWithOutliers, "zscore");

      expect(result).toContain(100);
    });

    it("returns empty array for empty data", () => {
      expect(outliers([])).toEqual([]);
    });
  });

  describe("movingAverage", () => {
    it("calculates moving average correctly", () => {
      const result = movingAverage([1, 2, 3, 4, 5], 3);

      expect(result).toEqual([2, 3, 4]);
    });

    it("throws error for invalid window size", () => {
      expect(() => movingAverage(sampleData, 0)).toThrow("Invalid window size");
      expect(() => movingAverage(sampleData, 15)).toThrow(
        "Invalid window size",
      );
    });
  });

  describe("histogram", () => {
    it("creates histogram correctly", () => {
      const result = histogram(smallData, 2);

      expect(result).toHaveLength(2);
      expect(result[0].count + result[1].count).toBe(3);
    });

    it("returns empty array for empty data", () => {
      expect(histogram([])).toEqual([]);
    });
  });

  describe("confidence", () => {
    it("calculates confidence interval correctly", () => {
      const result = confidence(sampleData, 0.95);

      expect(result.mean).toBe(5.5);
      expect(result.lower).toBeLessThan(result.mean);
      expect(result.upper).toBeGreaterThan(result.mean);
    });

    it("throws error for empty data", () => {
      expect(() => confidence([])).toThrow(
        "Cannot calculate confidence interval for empty dataset",
      );
    });

    it("throws error for invalid confidence level", () => {
      expect(() => confidence(sampleData, 0)).toThrow(
        "Confidence level must be between 0 and 1",
      );
      expect(() => confidence(sampleData, 1)).toThrow(
        "Confidence level must be between 0 and 1",
      );
    });
  });

  describe("tTest", () => {
    it("performs t-test correctly", () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [6, 7, 8, 9, 10];

      const result = tTest(sample1, sample2);

      expect(typeof result.tStatistic).toBe("number");
      expect(typeof result.pValue).toBe("number");
      expect(typeof result.significant).toBe("boolean");
    });

    it("throws error for empty samples", () => {
      expect(() => tTest([], [1, 2, 3])).toThrow(
        "Cannot perform t-test on empty samples",
      );
      expect(() => tTest([1, 2, 3], [])).toThrow(
        "Cannot perform t-test on empty samples",
      );
    });
  });
});
