import type { CursorPosition, NumberBadge, PendingConfirmation, ResolvedTarget } from "@/shared/types";

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
  private targetHighlightElement: HTMLDivElement | null = null;
  private bannerElement: HTMLDivElement | null = null;
  private confirmDialog: HTMLDivElement | null = null;
  private confirmMsg: HTMLDivElement | null = null;
  private confirmBtnYes: HTMLButtonElement | null = null;
  private confirmBtnNo: HTMLButtonElement | null = null;
  private breakDialog: HTMLDivElement | null = null;
  private breakMsg: HTMLDivElement | null = null;
  private breakBtnRecalibrate: HTMLButtonElement | null = null;
  private breakBtnDismiss: HTMLButtonElement | null = null;
  private dwellRingSvg: SVGSVGElement | null = null;
  private dwellRingCircle: SVGCircleElement | null = null;
  private badgesContainer: HTMLDivElement | null = null;
  private hudElement: HTMLDivElement | null = null;
  private bannerTimerId: ReturnType<typeof setTimeout> | null = null;

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
        .handsfree-target-highlight {
          position: absolute;
          border-radius: 6px;
          border: 2px solid rgba(0, 210, 255, 0.85);
          box-shadow: 0 0 10px rgba(0, 210, 255, 0.45);
          pointer-events: none;
          display: none;
          z-index: 99;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .handsfree-target-highlight.locked {
          border-color: #ffb142;
          box-shadow: 0 0 14px rgba(255, 177, 66, 0.7);
        }
        .handsfree-target-highlight.active {
          display: block;
        }
        .handsfree-banner {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(18, 18, 24, 0.92);
          color: #f1f2f6;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          padding: 8px 18px;
          border-radius: 20px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
          pointer-events: none;
          z-index: 1000;
          display: none;
          transition: opacity 0.2s ease;
        }
        .handsfree-banner.active {
          display: block;
        }
        .handsfree-banner.success { border-color: #00e676; }
        .handsfree-banner.warning { border-color: #ffb142; color: #ffeaa7; }
        .handsfree-banner.error { border-color: #ff5252; color: #ff7675; }

        .handsfree-dialog-box {
          position: fixed;
          top: 70px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(24, 25, 32, 0.95);
          color: #ffffff;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          padding: 16px 20px;
          border-radius: 12px;
          backdrop-filter: blur(10px);
          border: 1px solid #ffb142;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
          pointer-events: auto;
          z-index: 1001;
          display: none;
          flex-direction: column;
          gap: 12px;
          min-width: 320px;
          max-width: 450px;
        }
        .handsfree-dialog-box.active {
          display: flex;
        }
        .handsfree-btn-group {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .handsfree-btn {
          cursor: pointer;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          transition: background 0.15s ease;
        }
        .handsfree-btn-primary {
          background: #00e676;
          color: #0b2212;
        }
        .handsfree-btn-primary:hover {
          background: #2ecc71;
        }
        .handsfree-btn-secondary {
          background: rgba(255, 255, 255, 0.15);
          color: #f1f2f6;
        }
        .handsfree-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      </style>
      <div id="target-highlight" class="handsfree-target-highlight"></div>
      <div id="cursor" class="handsfree-cursor"></div>
      <svg id="dwell-svg" class="handsfree-dwell-svg">
        <circle id="dwell-circle" class="handsfree-dwell-circle" cx="24" cy="24" r="20" />
      </svg>
      <div id="badges"></div>
      <div id="banner" class="handsfree-banner" role="status" aria-live="polite"></div>
      <div id="confirm-dialog" class="handsfree-dialog-box" role="dialog" aria-modal="true">
        <div id="confirm-msg"></div>
        <div class="handsfree-btn-group">
          <button id="confirm-btn-yes" class="handsfree-btn handsfree-btn-primary">Confirm [Enter]</button>
          <button id="confirm-btn-no" class="handsfree-btn handsfree-btn-secondary">Cancel [Esc]</button>
        </div>
      </div>
      <div id="break-dialog" class="handsfree-dialog-box" role="alertdialog">
        <div id="break-msg"></div>
        <div class="handsfree-btn-group">
          <button id="break-btn-recalibrate" class="handsfree-btn handsfree-btn-primary">Recalibrate</button>
          <button id="break-btn-dismiss" class="handsfree-btn handsfree-btn-secondary">Dismiss</button>
        </div>
      </div>
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
    this.targetHighlightElement = this.shadow.getElementById("target-highlight") as HTMLDivElement;
    this.bannerElement = this.shadow.getElementById("banner") as HTMLDivElement;
    this.confirmDialog = this.shadow.getElementById("confirm-dialog") as HTMLDivElement;
    this.confirmMsg = this.shadow.getElementById("confirm-msg") as HTMLDivElement;
    this.confirmBtnYes = this.shadow.getElementById("confirm-btn-yes") as HTMLButtonElement;
    this.confirmBtnNo = this.shadow.getElementById("confirm-btn-no") as HTMLButtonElement;
    this.breakDialog = this.shadow.getElementById("break-dialog") as HTMLDivElement;
    this.breakMsg = this.shadow.getElementById("break-msg") as HTMLDivElement;
    this.breakBtnRecalibrate = this.shadow.getElementById("break-btn-recalibrate") as HTMLButtonElement;
    this.breakBtnDismiss = this.shadow.getElementById("break-btn-dismiss") as HTMLButtonElement;
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

  public highlightTarget(target: ResolvedTarget | null, isLocked = false): void {
    if (!this.targetHighlightElement) return;
    if (!target) {
      this.targetHighlightElement.classList.remove("active", "locked");
      return;
    }

    this.targetHighlightElement.style.top = `${target.rect.top}px`;
    this.targetHighlightElement.style.left = `${target.rect.left}px`;
    this.targetHighlightElement.style.width = `${target.rect.width}px`;
    this.targetHighlightElement.style.height = `${target.rect.height}px`;

    this.targetHighlightElement.classList.add("active");
    if (isLocked) {
      this.targetHighlightElement.classList.add("locked");
    } else {
      this.targetHighlightElement.classList.remove("locked");
    }
  }

  public showBanner(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    timeoutMs = 3000
  ): void {
    if (!this.bannerElement) return;
    if (this.bannerTimerId) {
      clearTimeout(this.bannerTimerId);
      this.bannerTimerId = null;
    }

    this.bannerElement.className = `handsfree-banner active ${type}`;
    this.bannerElement.textContent = message;

    if (timeoutMs > 0) {
      this.bannerTimerId = setTimeout(() => {
        this.hideBanner();
      }, timeoutMs);
    }
  }

  public hideBanner(): void {
    if (!this.bannerElement) return;
    this.bannerElement.classList.remove("active");
  }

  public showConfirmPrompt(
    pending: PendingConfirmation,
    onResolve: (confirmed: boolean) => void
  ): void {
    if (!this.confirmDialog || !this.confirmMsg) return;
    this.confirmMsg.innerHTML = `
      <div style="font-weight:700; color:#ffb142; margin-bottom:4px;">⚠️ Confirmation Required</div>
      <div style="margin-bottom:4px;">Are you sure you want to <strong>${pending.actionType}</strong> on "<em>${pending.targetDescription}</em>"?</div>
      <div style="font-size:12px; opacity:0.8;">Say "Confirm" or press Enter. Say "Cancel" to abort.</div>
    `;
    this.confirmDialog.classList.add("active");

    if (this.confirmBtnYes) {
      this.confirmBtnYes.onclick = () => {
        this.hideConfirmPrompt();
        onResolve(true);
      };
    }
    if (this.confirmBtnNo) {
      this.confirmBtnNo.onclick = () => {
        this.hideConfirmPrompt();
        onResolve(false);
      };
    }
  }

  public hideConfirmPrompt(): void {
    if (!this.confirmDialog) return;
    this.confirmDialog.classList.remove("active");
  }

  public showBreakPrompt(
    message: string,
    onRecalibrate: () => void,
    onDismiss: () => void
  ): void {
    if (!this.breakDialog || !this.breakMsg) return;
    this.breakMsg.innerHTML = `
      <div style="font-weight:700; color:#00e676; margin-bottom:4px;">☕ Comfort & Strain Notice</div>
      <div style="margin-bottom:4px;">${message}</div>
      <div style="font-size:12px; opacity:0.8;">Say "Recalibrate" or "Dismiss".</div>
    `;
    this.breakDialog.classList.add("active");

    if (this.breakBtnRecalibrate) {
      this.breakBtnRecalibrate.onclick = () => {
        this.hideBreakPrompt();
        onRecalibrate();
      };
    }
    if (this.breakBtnDismiss) {
      this.breakBtnDismiss.onclick = () => {
        this.hideBreakPrompt();
        onDismiss();
      };
    }
  }

  public hideBreakPrompt(): void {
    if (!this.breakDialog) return;
    this.breakDialog.classList.remove("active");
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

export function highlightTarget(target: ResolvedTarget | null, isLocked = false): void {
  getOverlay().highlightTarget(target, isLocked);
}

export function showBanner(
  message: string,
  type?: "info" | "success" | "warning" | "error",
  timeoutMs?: number
): void {
  getOverlay().showBanner(message, type, timeoutMs);
}

export function hideBanner(): void {
  getOverlay().hideBanner();
}

export function showConfirmPrompt(
  pending: PendingConfirmation,
  onResolve: (confirmed: boolean) => void
): void {
  getOverlay().showConfirmPrompt(pending, onResolve);
}

export function hideConfirmPrompt(): void {
  getOverlay().hideConfirmPrompt();
}

export function showBreakPrompt(
  message: string,
  onRecalibrate: () => void,
  onDismiss: () => void
): void {
  getOverlay().showBreakPrompt(message, onRecalibrate, onDismiss);
}

export function hideBreakPrompt(): void {
  getOverlay().hideBreakPrompt();
}

