import type { Locale, TranscriptEvent } from "@/shared/types";

export interface VoiceState {
  listening: boolean;
  locale: Locale;
  isPaused: boolean;
  isDictating: boolean;
  error?: string;
}

export type TranscriptHandler = (event: TranscriptEvent) => void;
export type StateChangeHandler = (state: VoiceState) => void;

// Web Speech API interface declarations for TypeScript compatibility
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    isFinal: boolean;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

export class VoiceManager {
  private recognition: SpeechRecognitionLike | null = null;
  private state: VoiceState = {
    listening: false,
    locale: "en",
    isPaused: false,
    isDictating: false,
  };
  private transcriptHandlers: Set<TranscriptHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();
  private shouldAutoRestart = true;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(initialLocale: Locale = "en") {
    this.state.locale = initialLocale;
  }

  public onTranscript(handler: TranscriptHandler): () => void {
    this.transcriptHandlers.add(handler);
    return () => this.transcriptHandlers.delete(handler);
  }

  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  public getState(): VoiceState {
    return { ...this.state };
  }

  private emitState(): void {
    const copy = this.getState();
    for (const h of this.stateHandlers) {
      h(copy);
    }
  }

  private getRecognitionLang(locale: Locale): string {
    if (locale === "hi") return "hi-IN";
    if (typeof navigator !== "undefined" && navigator.language) {
      // If user's browser is en-US or en-GB, respect it, else default to en-IN for Indian English & Hinglish
      if (navigator.language.startsWith("en-")) {
        return navigator.language;
      }
    }
    return "en-IN";
  }

  public startListening(locale?: Locale): void {
    if (locale) {
      this.state.locale = locale;
    }
    this.shouldAutoRestart = true;
    this.state.isPaused = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (typeof window === "undefined") {
      this.state.listening = true;
      this.emitState();
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRec) {
      this.state.error = "SpeechRecognition not supported in this browser environment";
      this.emitState();
      return;
    }

    try {
      if (this.recognition) {
        try {
          const oldRec = this.recognition;
          oldRec.onresult = null;
          oldRec.onerror = null;
          oldRec.onend = null;
          oldRec.abort();
        } catch {
          // Safe ignore
        }
        this.recognition = null;
      }

      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = this.getRecognitionLang(this.state.locale);

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (!res || !res[0]) continue;
          const transcript = res[0].transcript.trim();
          if (!transcript) continue;

          const confidence = typeof res[0].confidence === "number" && res[0].confidence > 0
            ? res[0].confidence
            : 0.9;
          const isFinal = res.isFinal;

          const transcriptEvent: TranscriptEvent = {
            text: transcript,
            isFinal,
            confidence,
            locale: this.state.locale,
          };

          for (const h of this.transcriptHandlers) {
            try {
              h(transcriptEvent);
            } catch (err) {
              console.error("[VoiceManager] Handler error:", err);
            }
          }
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
        // "no-speech" and "aborted" are routine browser events, not fatal failures.
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }

        console.warn("[VoiceManager] SpeechRecognition error:", event.error);
        this.state.error = event.error;
        this.emitState();
      };

      rec.onend = () => {
        // Chrome ends continuous speech recognition periodically or when silent.
        // We restart it cleanly via onend ONLY (preventing conflicting restart loops).
        if (this.shouldAutoRestart && !this.state.isPaused) {
          if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
          }
          this.restartTimeout = setTimeout(() => {
            this.restartTimeout = null;
            if (this.shouldAutoRestart && !this.state.isPaused) {
              this.startListening();
            }
          }, 150);
        } else {
          this.state.listening = false;
          this.emitState();
        }
      };

      rec.start();
      this.recognition = rec;
      this.state.listening = true;
      this.state.error = undefined;
      this.emitState();
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
      this.emitState();
    }
  }

  public stopListening(): void {
    this.shouldAutoRestart = false;
    this.state.listening = false;
    this.state.isPaused = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
      this.recognition = null;
    }
    this.emitState();
  }

  public pauseListening(): void {
    this.state.isPaused = true;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
    }
    this.emitState();
  }

  public resumeListening(): void {
    this.state.isPaused = false;
    if (!this.state.listening) {
      this.startListening();
    } else {
      this.emitState();
    }
  }

  public setLocale(locale: Locale): void {
    if (this.state.locale === locale) return;
    this.state.locale = locale;
    if (this.state.listening) {
      this.startListening(locale);
    } else {
      this.emitState();
    }
  }

  public setDictating(isDictating: boolean): void {
    this.state.isDictating = isDictating;
    this.emitState();
  }
}

const defaultVoiceManager = new VoiceManager();

export function startListening(locale: Locale = "en"): void {
  defaultVoiceManager.startListening(locale);
}

export function stopListening(): void {
  defaultVoiceManager.stopListening();
}

export function setLocale(locale: Locale): void {
  defaultVoiceManager.setLocale(locale);
}

export function getVoiceManager(): VoiceManager {
  return defaultVoiceManager;
}
