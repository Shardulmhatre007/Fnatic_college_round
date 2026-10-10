/**
 * One Euro filter implementation for 1D and 2D signal smoothing.
 *
 * Reference: Casiez, G., Roussel, N. and Vogel, D. (2012).
 * 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Human-Computer Interaction.
 * CHI '12.
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.s = alpha * value + (1.0 - alpha) * this.s;
    this.y = this.s;
    return this.y;
  }

  public hasLastRawValue(): boolean {
    return this.y !== null;
  }

  public lastRawValue(): number {
    return this.y ?? 0;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

function computeAlpha(rate: number, cutoff: number): number {
  const tau = 1.0 / (2.0 * Math.PI * cutoff);
  const te = 1.0 / rate;
  return 1.0 / (1.0 + tau / te);
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilt = new LowPassFilter();
  private dxFilt = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public setParams(minCutoff: number, beta: number, dCutoff = 1.0): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public filter(value: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilt.filter(value, 1.0);
    }

    const dt = Math.max((timestampMs - this.lastTime) / 1000.0, 0.001);
    this.lastTime = timestampMs;
    const rate = 1.0 / dt;

    const dx = this.xFilt.hasLastRawValue()
      ? (value - this.xFilt.lastRawValue()) * rate
      : 0.0;

    const edx = this.dxFilt.filter(dx, computeAlpha(rate, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilt.filter(value, computeAlpha(rate, cutoff));
  }

  public reset(): void {
    this.xFilt.reset();
    this.dxFilt.reset();
    this.lastTime = null;
  }
}

/**
 * 2D wrapper over two independent 1D One Euro filters for screen coordinates.
 */
export class OneEuroFilter2D {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  public setParams(minCutoff: number, beta: number, dCutoff = 1.0): void {
    this.filterX.setParams(minCutoff, beta, dCutoff);
    this.filterY.setParams(minCutoff, beta, dCutoff);
  }

  public filter(x: number, y: number, timestampMs: number): { x: number; y: number } {
    return {
      x: this.filterX.filter(x, timestampMs),
      y: this.filterY.filter(y, timestampMs),
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}
