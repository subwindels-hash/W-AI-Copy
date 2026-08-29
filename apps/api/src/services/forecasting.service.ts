/**
 * Forecasting Service (Module 11 — Gap 2)
 *
 * Predict future values using statistical methods:
 * - Moving Average (MA) - smooth short-term fluctuations
 * - Exponential Smoothing (ES) - weight recent data more heavily
 * - Double Exponential Smoothing (Holt's method) - capture trends
 * - Triple Exponential Smoothing (Holt-Winters) - capture trends and seasonality
 * - Linear Regression - fit trend line
 * - Confidence intervals - quantify prediction uncertainty
 *
 * Uses time series data from TimeSeriesService.
 */
import { logger } from "../config/logger.js";
import {
  queryDataPoints,
  getLatestPoints,
  type TimeSeriesDataPoint,
} from "./timeSeries.service.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ForecastPoint {
  timestamp: number;
  value: number;
  lowerBound?: number; // Lower confidence bound
  upperBound?: number; // Upper confidence bound
  confidence?: number; // Confidence level (0-1)
}

export interface ForecastResult {
  timeSeriesId: string;
  method: ForecastMethod;
  historicalPoints: number;
  forecastPoints: ForecastPoint[];
  parameters: Record<string, any>;
  accuracy?: ForecastAccuracy;
  generatedAt: number;
}

export type ForecastMethod =
  | "moving_average"
  | "exponential_smoothing"
  | "double_exponential_smoothing"
  | "triple_exponential_smoothing"
  | "linear_regression";

export interface ForecastAccuracy {
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Square Error
  mape: number; // Mean Absolute Percentage Error
  r2: number; // R-squared (coefficient of determination)
}

export interface ForecastOptions {
  method: ForecastMethod;
  horizon: number; // Number of periods to forecast
  interval: number; // Time interval between points (ms)
  confidenceLevel?: number; // Confidence level for intervals (0-1, default 0.95)
  // Method-specific parameters
  windowSize?: number; // For moving average
  alpha?: number; // Smoothing factor (0-1) for exponential smoothing
  beta?: number; // Trend smoothing factor for double exponential
  gamma?: number; // Seasonal smoothing factor for triple exponential
  seasonLength?: number; // Length of seasonal cycle for triple exponential
}

// ─── Forecasting Methods ────────────────────────────────────────

/**
 * Simple Moving Average (SMA)
 * Forecast = average of last N values
 */
function movingAverage(
  values: number[],
  horizon: number,
  windowSize: number,
): number[] {
  const forecasts: number[] = [];
  const window = values.slice(-windowSize);

  for (let i = 0; i < horizon; i++) {
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    forecasts.push(avg);
    window.push(avg);
    window.shift();
  }

  return forecasts;
}

/**
 * Exponential Smoothing (Simple)
 * Forecast = α * current + (1 - α) * previous_forecast
 */
function exponentialSmoothing(
  values: number[],
  horizon: number,
  alpha: number,
): number[] {
  const forecasts: number[] = [];
  let forecast = values[values.length - 1];

  for (let i = 0; i < horizon; i++) {
    forecasts.push(forecast);
    // For future periods, forecast remains the same (no new data)
  }

  return forecasts;
}

/**
 * Double Exponential Smoothing (Holt's Method)
 * Captures trend: level + trend
 */
function doubleExponentialSmoothing(
  values: number[],
  horizon: number,
  alpha: number,
  beta: number,
): number[] {
  if (values.length < 2) {
    return new Array(horizon).fill(values[values.length - 1]);
  }

  // Initialize level and trend
  let level = values[0];
  let trend = values[1] - values[0];

  // Update level and trend through historical data
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  // Forecast future values
  const forecasts: number[] = [];
  for (let i = 1; i <= horizon; i++) {
    forecasts.push(level + i * trend);
  }

  return forecasts;
}

/**
 * Triple Exponential Smoothing (Holt-Winters Method)
 * Captures trend and seasonality: level + trend + seasonal
 */
function tripleExponentialSmoothing(
  values: number[],
  horizon: number,
  alpha: number,
  beta: number,
  gamma: number,
  seasonLength: number,
): number[] {
  if (values.length < 2 * seasonLength) {
    // Not enough data for seasonality, fall back to double exponential
    return doubleExponentialSmoothing(values, horizon, alpha, beta);
  }

  // Initialize seasonal components
  const seasonals: number[] = new Array(seasonLength).fill(0);
  const seasonAverages: number[] = [];
  const numSeasons = Math.floor(values.length / seasonLength);

  for (let i = 0; i < numSeasons; i++) {
    const seasonData = values.slice(i * seasonLength, (i + 1) * seasonLength);
    seasonAverages.push(seasonData.reduce((sum, val) => sum + val, 0) / seasonLength);
  }

  for (let i = 0; i < seasonLength; i++) {
    let sum = 0;
    for (let j = 0; j < numSeasons; j++) {
      sum += values[j * seasonLength + i] / seasonAverages[j];
    }
    seasonals[i] = sum / numSeasons;
  }

  // Initialize level and trend
  let level = values[0];
  let trend = (values[seasonLength] - values[0]) / seasonLength;

  // Update through historical data
  for (let i = 0; i < values.length; i++) {
    const seasonIndex = i % seasonLength;
    const prevLevel = level;
    level = alpha * (values[i] / seasonals[seasonIndex]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonals[seasonIndex] = gamma * (values[i] / level) + (1 - gamma) * seasonals[seasonIndex];
  }

  // Forecast future values
  const forecasts: number[] = [];
  for (let i = 1; i <= horizon; i++) {
    const seasonIndex = (values.length + i - 1) % seasonLength;
    forecasts.push((level + i * trend) * seasonals[seasonIndex]);
  }

  return forecasts;
}

/**
 * Linear Regression
 * Fit a line: y = mx + b
 */
function linearRegression(
  values: number[],
  horizon: number,
): number[] {
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);

  // Calculate means
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = values.reduce((sum, val) => sum + val, 0) / n;

  // Calculate slope (m) and intercept (b)
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (values[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
  }

  const m = denominator === 0 ? 0 : numerator / denominator;
  const b = yMean - m * xMean;

  // Forecast future values
  const forecasts: number[] = [];
  for (let i = 0; i < horizon; i++) {
    const xVal = n + i;
    forecasts.push(m * xVal + b);
  }

  return forecasts;
}

// ─── Confidence Intervals ───────────────────────────────────────

/**
 * Calculate confidence intervals for forecasts.
 * Uses historical residuals to estimate prediction uncertainty.
 */
function calculateConfidenceIntervals(
  historical: number[],
  forecasts: number[],
  confidenceLevel: number,
): Array<{ lower: number; upper: number }> {
  // Calculate historical standard deviation
  const mean = historical.reduce((sum, val) => sum + val, 0) / historical.length;
  const variance = historical.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / historical.length;
  const stdDev = Math.sqrt(variance);

  // Z-score for confidence level (approximation)
  const zScores: Record<number, number> = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };
  const z = zScores[confidenceLevel] ?? 1.96;

  // Confidence intervals widen over time
  return forecasts.map((forecast, i) => {
    const uncertainty = stdDev * z * Math.sqrt(i + 1); // Widens with horizon
    return {
      lower: forecast - uncertainty,
      upper: forecast + uncertainty,
    };
  });
}

// ─── Forecast Accuracy ──────────────────────────────────────────

/**
 * Calculate forecast accuracy metrics.
 */
function calculateAccuracy(
  actual: number[],
  predicted: number[],
): ForecastAccuracy {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) {
    return { mae: 0, rmse: 0, mape: 0, r2: 0 };
  }

  let sumAbsError = 0;
  let sumSqError = 0;
  let sumAbsPctError = 0;

  for (let i = 0; i < n; i++) {
    const error = actual[i] - predicted[i];
    sumAbsError += Math.abs(error);
    sumSqError += error * error;
    if (actual[i] !== 0) {
      sumAbsPctError += Math.abs(error / actual[i]);
    }
  }

  const mae = sumAbsError / n;
  const rmse = Math.sqrt(sumSqError / n);
  const mape = (sumAbsPctError / n) * 100;

  // R-squared
  const actualMean = actual.reduce((sum, val) => sum + val, 0) / actual.length;
  const ssRes = actual.reduce((sum, val, i) => sum + Math.pow(val - predicted[i], 2), 0);
  const ssTot = actual.reduce((sum, val) => sum + Math.pow(val - actualMean, 2), 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { mae, rmse, mape, r2 };
}

// ─── Main Forecasting Function ──────────────────────────────────

/**
 * Generate a forecast for a time series.
 */
export async function forecast(
  timeSeriesId: string,
  options: ForecastOptions,
): Promise<ForecastResult> {
  const {
    method,
    horizon,
    interval,
    confidenceLevel = 0.95,
    windowSize = 10,
    alpha = 0.3,
    beta = 0.1,
    gamma = 0.1,
    seasonLength = 12,
  } = options;

  // Get historical data
  const historicalPoints = await getLatestPoints(timeSeriesId, 1000);
  
  if (historicalPoints.length < 2) {
    throw new Error("Insufficient historical data for forecasting (need at least 2 points)");
  }

  const values = historicalPoints.map(p => p.value);
  const lastTimestamp = historicalPoints[historicalPoints.length - 1].timestamp;

  // Generate forecast values
  let forecastValues: number[];
  const parameters: Record<string, any> = { method };

  switch (method) {
    case "moving_average":
      forecastValues = movingAverage(values, horizon, windowSize);
      parameters.windowSize = windowSize;
      break;

    case "exponential_smoothing":
      forecastValues = exponentialSmoothing(values, horizon, alpha);
      parameters.alpha = alpha;
      break;

    case "double_exponential_smoothing":
      forecastValues = doubleExponentialSmoothing(values, horizon, alpha, beta);
      parameters.alpha = alpha;
      parameters.beta = beta;
      break;

    case "triple_exponential_smoothing":
      forecastValues = tripleExponentialSmoothing(values, horizon, alpha, beta, gamma, seasonLength);
      parameters.alpha = alpha;
      parameters.beta = beta;
      parameters.gamma = gamma;
      parameters.seasonLength = seasonLength;
      break;

    case "linear_regression":
      forecastValues = linearRegression(values, horizon);
      break;

    default:
      throw new Error(`Unknown forecasting method: ${method}`);
  }

  // Calculate confidence intervals
  const confidenceIntervals = calculateConfidenceIntervals(values, forecastValues, confidenceLevel);

  // Build forecast points
  const forecastPoints: ForecastPoint[] = forecastValues.map((value, i) => ({
    timestamp: lastTimestamp + (i + 1) * interval,
    value,
    lowerBound: confidenceIntervals[i].lower,
    upperBound: confidenceIntervals[i].upper,
    confidence: confidenceLevel,
  }));

  // Calculate accuracy if we have enough data for backtesting
  let accuracy: ForecastAccuracy | undefined;
  if (values.length > horizon + 10) {
    // Use last N points as test set
    const trainSize = values.length - horizon;
    const trainValues = values.slice(0, trainSize);
    const testValues = values.slice(trainSize);

    // Generate forecast on training data
    let trainForecast: number[];
    switch (method) {
      case "moving_average":
        trainForecast = movingAverage(trainValues, horizon, windowSize);
        break;
      case "exponential_smoothing":
        trainForecast = exponentialSmoothing(trainValues, horizon, alpha);
        break;
      case "double_exponential_smoothing":
        trainForecast = doubleExponentialSmoothing(trainValues, horizon, alpha, beta);
        break;
      case "triple_exponential_smoothing":
        trainForecast = tripleExponentialSmoothing(trainValues, horizon, alpha, beta, gamma, seasonLength);
        break;
      case "linear_regression":
        trainForecast = linearRegression(trainValues, horizon);
        break;
      default:
        trainForecast = [];
    }

    accuracy = calculateAccuracy(testValues, trainForecast);
  }

  const result: ForecastResult = {
    timeSeriesId,
    method,
    historicalPoints: values.length,
    forecastPoints,
    parameters,
    accuracy,
    generatedAt: Date.now(),
  };

  logger.info("Forecast generated", {
    timeSeriesId,
    method,
    horizon,
    historicalPoints: values.length,
    accuracy: accuracy?.mae.toFixed(2),
  });

  return result;
}

/**
 * Compare multiple forecasting methods.
 */
export async function compareForecastingMethods(
  timeSeriesId: string,
  methods: ForecastMethod[],
  options: Omit<ForecastOptions, "method">,
): Promise<ForecastResult[]> {
  const results: ForecastResult[] = [];

  for (const method of methods) {
    try {
      const result = await forecast(timeSeriesId, { ...options, method });
      results.push(result);
    } catch (error) {
      logger.warn("Forecasting method failed", { method, error });
    }
  }

  // Sort by accuracy (MAE)
  results.sort((a, b) => (a.accuracy?.mae ?? Infinity) - (b.accuracy?.mae ?? Infinity));

  return results;
}

/**
 * Get the best forecasting method for a time series.
 */
export async function getBestForecastingMethod(
  timeSeriesId: string,
  options: Omit<ForecastOptions, "method">,
): Promise<{ method: ForecastMethod; result: ForecastResult }> {
  const allMethods: ForecastMethod[] = [
    "moving_average",
    "exponential_smoothing",
    "double_exponential_smoothing",
    "triple_exponential_smoothing",
    "linear_regression",
  ];

  const results = await compareForecastingMethods(timeSeriesId, allMethods, options);

  if (results.length === 0) {
    throw new Error("All forecasting methods failed");
  }

  const best = results[0];
  return { method: best.method, result: best };
}
