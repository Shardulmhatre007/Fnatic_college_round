# Benchmark Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/benchmark/`

## Purpose

Runs a standard task suite (click 10 targets, fill a form, search and open a result,
switch tabs) and records `BenchmarkRun` metrics. Displays results as charts comparing
head/voice control against simulated mouse and keyboard baselines.

## Public interface

```ts
// benchmark/index.ts
export function startBenchmark(taskId: string): Promise<BenchmarkRun>;
export function getBenchmarkHistory(): Promise<BenchmarkRun[]>;
```

Results are stored locally with `chrome.storage` and optionally synced to the backend.

## Dependencies

- `shared/types.ts` (BenchmarkRun)
- `shared/schemas.ts` (benchmarkRunSchema)
