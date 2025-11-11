import * as ss from "simple-statistics";

export interface StatisticalSummary {
  mean: number;
  median: number;
  mode: number | null;
  standardDeviation: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  count: number;
  sum: number;
  quantiles: {
    q1: number;
    q3: number;
    iqr: number;
  };
}

export interface CorrelationResult {
  coefficient: number;
  strength: "very weak" | "weak" | "moderate" | "strong" | "very strong";
  direction: "positive" | "negative" | "none";
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  predict: (x: number) => number;
}

export function descriptiveStats(data: number[]): StatisticalSummary {
  if (data.length === 0) {
    throw new Error("Cannot calculate statistics for empty dataset");
  }

  const mean = ss.mean(data);
  const median = ss.median(data);
  const standardDeviation = ss.standardDeviation(data);
  const variance = ss.variance(data);
  const min = ss.min(data);
  const max = ss.max(data);
  const sum = ss.sum(data);
  const q1 = ss.quantile(data, 0.25);
  const q3 = ss.quantile(data, 0.75);

  let mode: number | null = null;
  try {
    mode = ss.mode(data);
  } catch {
    mode = null;
  }

  return {
    mean,
    median,
    mode,
    standardDeviation,
    variance,
    min,
    max,
    range: max - min,
    count: data.length,
    sum,
    quantiles: {
      q1,
      q3,
      iqr: q3 - q1,
    },
  };
}

export function correlation(x: number[], y: number[]): CorrelationResult {
  if (x.length !== y.length) {
    throw new Error("Arrays must have the same length");
  }
  if (x.length === 0) {
    throw new Error("Cannot calculate correlation for empty datasets");
  }

  const coefficient = ss.sampleCorrelation(x, y);
  const absCoeff = Math.abs(coefficient);

  let strength: CorrelationResult["strength"];
  if (absCoeff < 0.2) strength = "very weak";
  else if (absCoeff < 0.4) strength = "weak";
  else if (absCoeff < 0.6) strength = "moderate";
  else if (absCoeff < 0.8) strength = "strong";
  else strength = "very strong";

  const direction =
    coefficient > 0 ? "positive" : coefficient < 0 ? "negative" : "none";

  return {
    coefficient,
    strength,
    direction,
  };
}

export function linearRegression(x: number[], y: number[]): RegressionResult {
  if (x.length !== y.length) {
    throw new Error("Arrays must have the same length");
  }
  if (x.length < 2) {
    throw new Error("Need at least 2 data points for regression");
  }

  const points = x.map((xi, i) => [xi, y[i]]);
  const regression = ss.linearRegression(points);
  const rSquared = ss.rSquared(points, ss.linearRegressionLine(regression));

  return {
    slope: regression.m,
    intercept: regression.b,
    rSquared,
    predict: (xVal: number) => regression.m * xVal + regression.b,
  };
}

export function zScore(
  value: number,
  mean: number,
  standardDeviation: number,
): number {
  if (standardDeviation === 0) {
    throw new Error("Standard deviation cannot be zero");
  }
  return (value - mean) / standardDeviation;
}

export function percentile(data: number[], p: number): number {
  if (p < 0 || p > 1) {
    throw new Error("Percentile must be between 0 and 1");
  }
  return ss.quantile(data, p);
}

export function outliers(
  data: number[],
  method: "iqr" | "zscore" = "iqr",
): number[] {
  if (data.length === 0) {
    return [];
  }

  if (method === "iqr") {
    const q1 = ss.quantile(data, 0.25);
    const q3 = ss.quantile(data, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return data.filter((value) => value < lowerBound || value > upperBound);
  }

  // method === "zscore"
  const mean = ss.mean(data);
  const stdDev = ss.standardDeviation(data);
  return data.filter((value) => Math.abs(zScore(value, mean, stdDev)) > 2);
}

export function movingAverage(data: number[], windowSize: number): number[] {
  if (windowSize <= 0 || windowSize > data.length) {
    throw new Error("Invalid window size");
  }

  const result: number[] = [];
  for (let i = 0; i <= data.length - windowSize; i++) {
    const window = data.slice(i, i + windowSize);
    result.push(ss.mean(window));
  }
  return result;
}

export function histogram(
  data: number[],
  bins = 10,
): { bin: string; count: number; frequency: number }[] {
  if (data.length === 0) {
    return [];
  }

  const min = ss.min(data);
  const max = ss.max(data);
  const binWidth = (max - min) / bins;
  const binCounts = new Array(bins).fill(0);

  data.forEach((value) => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
    binCounts[binIndex]++;
  });

  return binCounts.map((count, index) => {
    const binStart = min + index * binWidth;
    const binEnd = binStart + binWidth;
    return {
      bin: `${binStart.toFixed(2)}-${binEnd.toFixed(2)}`,
      count,
      frequency: count / data.length,
    };
  });
}

export function confidence(
  data: number[],
  level = 0.95,
): { mean: number; marginOfError: number; lower: number; upper: number } {
  if (data.length === 0) {
    throw new Error("Cannot calculate confidence interval for empty dataset");
  }
  if (level <= 0 || level >= 1) {
    throw new Error("Confidence level must be between 0 and 1");
  }

  const mean = ss.mean(data);
  const standardError = ss.standardDeviation(data) / Math.sqrt(data.length);
  const criticalValue = 1.96;
  const marginOfError = criticalValue * standardError;

  return {
    mean,
    marginOfError,
    lower: mean - marginOfError,
    upper: mean + marginOfError,
  };
}

export function tTest(
  sample1: number[],
  sample2: number[],
): { tStatistic: number; pValue: number; significant: boolean } {
  if (sample1.length === 0 || sample2.length === 0) {
    throw new Error("Cannot perform t-test on empty samples");
  }

  const mean1 = ss.mean(sample1);
  const mean2 = ss.mean(sample2);
  const var1 = ss.variance(sample1);
  const var2 = ss.variance(sample2);
  const n1 = sample1.length;
  const n2 = sample2.length;

  const pooledVariance = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const standardError = Math.sqrt(pooledVariance * (1 / n1 + 1 / n2));
  const tStatistic = (mean1 - mean2) / standardError;

  const pValue =
    2 * (1 - ss.cumulativeStdNormalProbability(Math.abs(tStatistic)));
  const significant = pValue < 0.05;

  return {
    tStatistic,
    pValue,
    significant,
  };
}
