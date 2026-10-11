import type { CursorPosition, NumberBadge } from "@/shared/types";

export interface UiStatusUpdate {
  trackingActive: boolean;
  voiceActive: boolean;
  activeProfile?: string;
  lightingQuality?: string;
  isPaused?: boolean;
}

export class OverlayManager {
  private shadow: ShadowRoot | null = null;
  private cursorElement: HTMLDivElement | null = null;
  private dwellRingSvg: SVGSVGElement | null = null;
  private dwellRingCircle: SVGCircleElement | null = null;
  private badgesContainer: HTMLDivElement | null = null;
  private hudElement: HTMLDivElement | null = null;

  constructor() {
    this.initDom();
  }

  private initDom(): void {
    if (typeof document === "undefined") return;

    let host = document.getElementById("handsfree-overlay-root") as HTMLElement | null;
    if (!host) {
      host = document.createElement("div");
      host.id = "handsfree-overlay-root";
      host.style.position = "fixed";
      host.style.top = "0";
      host.style.left = "0";
      host.style.width = "100vw";
      host.style.height = "100vh";
      host.style.pointerEvents = "none";
      host.style.zIndex = "2147483647";
      document.documentElement.appendChild(host);
    }

    if (!host.shadowRoot) {
      this.shadow = host.attachShadow({ mode: "open" });
    } else {
      this.shadow = host.shadowRoot;
    }

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .handsfree-cursor {
          position: absolute;
          width: 24px;
          height: 24px;
          margin-left: -12px;
          margin-top: -12px;
          border-radius: 50%;
          background: rgba(0, 168, 255, 0.45);
          border: 2px solid #00a8ff;
          box-shadow: 0 0 10px rgba(0, 168, 255, 0.6);
          pointer-events: none;
          transition: transform 0.05s ease-out;
          display: none;
        }
        .handsfree-cursor.active {
          display: block;
        }
        .handsfree-dwell-svg {
          position: absolute;
          width: 48px;
          height: 48px;
          margin-left: -24px;
          margin-top: -24px;
          pointer-events: none;
          transform: rotate(-90deg);
          display: none;
        }
        .handsfree-dwell-svg.active {
          display: block;
        }
        .handsfree-dwell-circle {
          fill: none;
          stroke: #00e676;
          stroke-width: 4;
          stroke-dasharray: 125.6;
          stroke-dashoffset: 125.6;
          transition: stroke-dashoffset 0.04s linear;
        }
        .handsfree-badge {
          position: fixed;
          background: #ffe600;
          color: #000000;
          font-family: system-ui, -apple-system, sans-serif;
          font-weight: 800;
          font-size: 12px;
          line-height: 1;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1.5px solid #000000;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
          pointer-events: none;
          z-index: 2147483647;
          transform: translate(-50%, -50%);
        }
        .handsfree-hud {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: rgba(18, 18, 24, 0.85);
          color: #f1f2f6;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          padding: 8px 14px;
          border-radius: 8px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          gap: 12px;
          pointer-events: none;
        }
        .hud-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #576574;
        }
        .hud-indicator.on {
          background: #00e676;
          box-shadow: 0 0 6px #00e676;
        }
      </style>
      <div id="cursor" class="handsfree-cursor"></div>
      <svg id="dwell-svg" class="handsfree-dwell-svg">
        <circle id="dwell-circle" class="handsfree-dwell-circle" cx="24" cy="24" r="20" />
      </svg>
      <div id="badges"></div>
      <div id="hud" class="handsfree-hud">
        <span style="display:flex; align-items:center; gap:6px;">
          <span id="tracking-ind" class="hud-indicator"></span> Tracking
        </span>
        <span style="display:flex; align-items:center; gap:6px;">
          <span id="voice-ind" class="hud-indicator"></span> Voice
        </span>
      </div>
    `;

    this.cursorElement = this.shadow.getElementById("cursor") as HTMLDivElement;
    this.dwellRingSvg = this.shadow.getElementById("dwell-svg") as unknown as SVGSVGElement;
    this.dwellRingCircle = this.shadow.getElementById("dwell-circle") as unknown as SVGCircleElement;
    this.badgesContainer = this.shadow.getElementById("badges") as HTMLDivElement;
    this.hudElement = this.shadow.getElementById("hud") as HTMLDivElement;
  }

  public renderCursor(pos: CursorPosition): void {
    if (!this.cursorElement) return;
    this.cursorElement.classList.add("active");
    this.cursorElement.style.left = `${pos.x}px`;
    this.cursorElement.style.top = `${pos.y}px`;
  }

  public hideCursor(): void {
    if (!this.cursorElement) return;
    this.cursorElement.classList.remove("active");
  }

  public showDwellRing(pos: CursorPosition, progressFraction: number): void {
    if (!this.dwellRingSvg || !this.dwellRingCircle) return;
    if (progressFraction <= 0) {
      this.hideDwellRing();
      return;
    }

    this.dwellRingSvg.classList.add("active");
    this.dwellRingSvg.style.left = `${pos.x}px`;
    this.dwellRingSvg.style.top = `${pos.y}px`;

    const circumference = 2 * Math.PI * 20; // 125.66
    const offset = circumference * (1 - Math.min(Math.max(progressFraction, 0), 1));
    this.dwellRingCircle.style.strokeDashoffset = `${offset}`;
  }

  public hideDwellRing(): void {
    if (!this.dwellRingSvg) return;
    this.dwellRingSvg.classList.remove("active");
  }

  public showNumbers(badges: NumberBadge[]): void {
    if (!this.badgesContainer) return;
    this.badgesContainer.innerHTML = "";

    for (const badge of badges) {
      const el = document.createElement("div");
      el.className = "handsfree-badge";
      el.textContent = `${badge.n}`;
      el.style.left = `${badge.rect.left}px`;
      el.style.top = `${badge.rect.top}px`;
      this.badgesContainer.appendChild(el);
    }
  }

  public hideNumbers(): void {
    if (!this.badgesContainer) return;
    this.badgesContainer.innerHTML = "";
  }

  public updateHud(status: UiStatusUpdate): void {
    if (!this.shadow || !this.hudElement) return;
    const trackingInd = this.shadow.getElementById("tracking-ind");
    const voiceInd = this.shadow.getElementById("voice-ind");

    if (trackingInd) {
      trackingInd.className = `hud-indicator ${status.trackingActive ? "on" : ""}`;
    }
    if (voiceInd) {
      voiceInd.className = `hud-indicator ${status.voiceActive ? "on" : ""}`;
    }
  }
}

let defaultOverlay: OverlayManager | null = null;

function getOverlay(): OverlayManager {
  if (!defaultOverlay) {
    defaultOverlay = new OverlayManager();
  }
  return defaultOverlay;
}

export function showNumbers(badges: NumberBadge[]): void {
  getOverlay().showNumbers(badges);
}

export function hideNumbers(): void {
  getOverlay().hideNumbers();
}

export function showDwellRing(pos: CursorPosition, progressFraction: number): void {
  getOverlay().showDwellRing(pos, progressFraction);
}

export function hideDwellRing(): void {
  getOverlay().hideDwellRing();
}

export function updateHud(status: UiStatusUpdate): void {
  getOverlay().updateHud(status);
}

export function renderCursor(pos: CursorPosition): void {
  getOverlay().renderCursor(pos);
}

export function hideCursor(): void {
  getOverlay().hideCursor();
}
