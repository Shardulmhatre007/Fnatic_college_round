import React, { useEffect, useRef, useState } from "react";
import { soundEffects } from "./audio";
import { saveSettings } from "@/shared/storage";
import { FastCameraTracker } from "@/modules/tracking/fast-tracker";
import {
  MediaPipeFaceTracker,
  type HeadTracker,
} from "@/modules/tracking/mediapipe-face-tracker";
import { updateCursor, type ViewportSize } from "@/modules/cursor/index";
import { feedFrame, type SelectionEvent } from "@/modules/selection/index";
import { getVoiceManager } from "@/modules/voice/index";
import { matchCommand } from "@/modules/commands/index";
import type { LandmarkResult } from "@/shared/types";

interface Bubble {
  id: number;
  label: string;
  x: number;
  y: number;
  popped: boolean;
}

export const OnboardingApp: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Hidden, always-mounted video used as the tracking source; the visible preview
  // reuses the same stream so the tracker never points at an unmounted element.
  const trackerVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<HeadTracker | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  // Virtual cursor position & dwell state for on-screen tracking
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 400, y: 300 });
  const [cursorVisible, setCursorVisible] = useState<boolean>(false);
  const [activeGesture, setActiveGesture] = useState<string>("Head Motion");

  // Bubble-pop calibration targets
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 1, label: "Top Left", x: 18, y: 22, popped: false },
    { id: 2, label: "Top Right", x: 82, y: 22, popped: false },
    { id: 3, label: "Center", x: 50, y: 50, popped: false },
    { id: 4, label: "Bottom Left", x: 20, y: 78, popped: false },
    { id: 5, label: "Bottom Right", x: 80, y: 78, popped: false },
  ]);

  const [voiceTestPassed, setVoiceTestPassed] = useState<boolean>(false);
  const [gestureTestPassed, setGestureTestPassed] = useState<boolean>(false);

  // Voice Sandbox Playground State (Step 4)
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [lastExecutedCommand, setLastExecutedCommand] = useState<string>("");
  const [sandboxInputText, setSandboxInputText] = useState<string>("");
  const [activeNumberBadge, setActiveNumberBadge] = useState<number | null>(null);
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [voiceErrorMsg, setVoiceErrorMsg] = useState<string | null>(null);
  const [lastOpenedUrl, setLastOpenedUrl] = useState<string | null>(null);
  const sandboxScrollRef = useRef<HTMLDivElement | null>(null);

  // Expose the current step to the tracker callback without recreating the tracker.
  const stepRef = useRef<number>(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Bind the stream to the hidden source video and start the tracker exactly once.
  useEffect(() => {
    const sourceVideo = trackerVideoRef.current;
    if (!activeStream || !sourceVideo) return;

    sourceVideo.srcObject = activeStream;
    void sourceVideo.play().catch(() => {});

    const handleFrame = (landmarks: LandmarkResult) => {
      const viewport: ViewportSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const pos = updateCursor(landmarks, viewport);
      setCursorPos(pos);
      setCursorVisible(true);

      if (landmarks.gestures.length > 0) {
        setActiveGesture(landmarks.gestures.join(", "));
      } else {
        setActiveGesture("Head Tracking (Active)");
      }

      // Relay landmarks to the active tab via the background service worker
      try {
        void chrome.runtime.sendMessage({
          type: "TRACKING_LANDMARKS",
          payload: landmarks,
        });
      } catch {
        // Safe ignore
      }

      const currentStep = stepRef.current;

      // Step 2: pop bubbles the virtual cursor passes over.
      if (currentStep === 2) {
        setBubbles((prev) =>
          prev.map((b) => {
            if (b.popped) return b;
            const bubblePxX = (b.x / 100) * window.innerWidth;
            const bubblePxY = (b.y / 100) * window.innerHeight;
            const dist = Math.hypot(pos.x - bubblePxX, pos.y - bubblePxY);
            if (dist < 60) {
              soundEffects.playBubblePop();
              return { ...b, popped: true };
            }
            return b;
          })
        );
      }

      // Step 3: dwell or nod selection.
      if (currentStep === 3) {
        const sel: SelectionEvent | null = feedFrame(pos, landmarks.gestures, landmarks.timestamp);
        if (sel) {
          soundEffects.playStepSuccess();
          setGestureTestPassed(true);
        }
      }
    };

    let tracker: HeadTracker | null = null;
    let cancelled = false;

    const startTracking = async () => {
      const faceTracker = new MediaPipeFaceTracker(sourceVideo);
      try {
        await faceTracker.load();
        if (cancelled) return;
        faceTracker.start(handleFrame);
        tracker = faceTracker;
      } catch (err) {
        // Fall back to the lightweight optical tracker if the model cannot load.
        console.warn("MediaPipe face tracker unavailable, using optical fallback", err);
        if (cancelled) return;
        const optical = new FastCameraTracker(sourceVideo);
        optical.start(handleFrame);
        tracker = optical;
      }
      trackerRef.current = tracker;
    };

    void startTracking();

    return () => {
      cancelled = true;
      tracker?.stop();
      trackerRef.current = null;
    };
  }, [activeStream]);

  // Feed the visible preview element with the same stream when it mounts per step.
  useEffect(() => {
    const el = previewVideoRef.current;
    if (el && activeStream) {
      el.srcObject = activeStream;
      void el.play().catch(() => {});
    }
  }, [activeStream, step]);

  // Re-centre the neutral reference when the calibration game begins.
  useEffect(() => {
    if (step === 2) {
      trackerRef.current?.calibrateNeutral();
    }
  }, [step]);

  // Stop camera tracks when the stream changes or the page unmounts.
  useEffect(() => {
    return () => {
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, [activeStream]);

  // Step 4: Active speech recognition & voice command sandbox runner
  useEffect(() => {
    if (step !== 4) return;

    const voiceManager = getVoiceManager();

    // Ensure audio permissions are active
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        // Keep microphone warm
        micStream.getAudioTracks().forEach((t) => (t.enabled = true));
      }).catch((err) => {
        console.warn("Microphone access warning:", err);
      });
    }

    voiceManager.startListening();

    const unsubState = voiceManager.onStateChange((state) => {
      setIsVoiceListening(state.listening && !state.isPaused);
      setVoiceErrorMsg(state.error ?? null);
    });

    const unsubscribe = voiceManager.onTranscript((event) => {
      if (!event.text) return;
      const text = event.text.trim();
      setLastTranscript(text);
      setVoiceTestPassed(true);

      // Check command matching
      const match = matchCommand(text, event.locale);

      if (match) {
        const actionType = match.command.action.type;
        setLastExecutedCommand(match.command.phrase);
        soundEffects.playBubblePop();

        // 1. Scroll command
        if (actionType === "scroll") {
          const dir = (match.command.action as { direction?: string }).direction === "up" ? -1 : 1;
          if (sandboxScrollRef.current) {
            sandboxScrollRef.current.scrollBy({ top: dir * 180, behavior: "smooth" });
          }
          window.scrollBy({ top: dir * 250, behavior: "smooth" });
        }
        // 2. Click number command (e.g., "14", "click 14", "number 14")
        else if (actionType === "click_number") {
          const num = match.extractedNumber ?? (match.command.action as { n?: number }).n;
          if (num !== undefined) {
            setActiveNumberBadge(num);
            soundEffects.playStepSuccess();
            setTimeout(() => setActiveNumberBadge(null), 1400);
          }
        }
        // 3. New line
        else if (actionType === "new_line") {
          setSandboxInputText((prev) => prev + "\n");
        }
        // 4. Delete last word
        else if (actionType === "delete_last_word") {
          setSandboxInputText((prev) => {
            const words = prev.trimEnd().split(" ");
            words.pop();
            return words.join(" ");
          });
        }
        // 5. Dictate controls
        else if (actionType === "dictate_start") {
          voiceManager.setDictating(true);
        } else if (actionType === "dictate_stop") {
          voiceManager.setDictating(false);
        }
        // 6. Website navigation
        else if (actionType === "open_url") {
          const url = (match.command.action as { url?: string }).url ?? "";
          if (url) {
            setLastOpenedUrl(url);
            setLastExecutedCommand(`Navigate → ${url}`);
            soundEffects.playStepSuccess();
            setVoiceTestPassed(true);
            // Navigate after a short preview delay
            setTimeout(() => { window.location.href = url; }, 1200);
          }
        }
      } else {
        // Direct speech typing into text box when speaking phrases like "how are you"
        if (event.isFinal) {
          setLastExecutedCommand(`Typed: "${text}"`);
          setSandboxInputText((prev) => (prev ? `${prev} ${text}` : text));
          soundEffects.playBubblePop();
        }
      }
    });

    return () => {
      unsubState();
      unsubscribe();
      voiceManager.stopListening();
    };
  }, [step]);

  // 1. Request camera & mic permission
  const handleRequestPermissions = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: true,
        });

        setActiveStream(stream);
        setPermissionGranted(true);
        setPermissionError(null);
        soundEffects.playStepSuccess();
        await saveSettings({ trackingEnabled: true, voiceEnabled: true });
      } else {
        setPermissionGranted(true);
      }
    } catch (err) {
      setPermissionError(
        "Camera or Microphone permission was dismissed or blocked. You can still test with simulated tracking."
      );
      setPermissionGranted(true);
    }
  };

  // 2. Handle bubble click fallback
  const handlePopBubble = (id: number) => {
    soundEffects.playBubblePop();
    const updated = bubbles.map((b) => (b.id === id ? { ...b, popped: true } : b));
    setBubbles(updated);

    if (updated.every((b) => b.popped)) {
      soundEffects.playStepSuccess();
    }
  };

  const allBubblesPopped = bubbles.every((b) => b.popped);

  // 3. Complete tutorial
  const handleFinish = async () => {
    soundEffects.playCelebration();
    await saveSettings({ trackingEnabled: true, voiceEnabled: true });
    setTimeout(() => {
      window.close();
    }, 1800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Real-time Handsfree Virtual Cursor */}
      {cursorVisible && (
        <div
          style={{
            transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`,
          }}
          className="fixed top-0 left-0 pointer-events-none z-50 -ml-3 -mt-3 w-7 h-7 rounded-full bg-cyan-400/40 border-2 border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.8)] transition-transform duration-[40ms] ease-out flex items-center justify-center"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm animate-ping" />
        </div>
      )}

      {/* Hidden tracking source; kept mounted across steps so the tracker never detaches. */}
      {activeStream && (
        <video ref={trackerVideoRef} autoPlay playsInline muted className="hidden" />
      )}

      {/* Top Header */}
      <header className="px-8 py-5 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-indigo-500/20">
            H
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide text-white font-display">Handsfree</h1>
            <p className="text-xs text-slate-400">Interactive Setup & Calibration</p>
          </div>
        </div>

        {/* Live HUD Pill showing current tracking state */}
        <div className="flex items-center gap-4">
          {permissionGranted && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{activeGesture}</span>
            </div>
          )}

          {/* Step indicator pills */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-8 bg-indigo-500 shadow-md shadow-indigo-500/40"
                    : i < step
                    ? "w-2.5 bg-emerald-500"
                    : "w-2.5 bg-slate-800"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Main interactive area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-8 flex flex-col justify-center z-10">
        {/* Step 1: Camera & Microphone Permissions */}
        {step === 1 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400 shadow-inner">
              📷
            </div>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white font-display">
                Camera & Microphone Access
              </h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Handsfree uses your webcam to track subtle head movements for cursor positioning and
                your microphone for speech commands. Video and audio streams never leave your device.
              </p>
            </div>

            {permissionError && (
              <div className="p-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg">
                {permissionError}
              </div>
            )}

            {!permissionGranted ? (
              <button
                onClick={handleRequestPermissions}
                className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                Allow Access & Start Camera
              </button>
            ) : (
              <div className="space-y-5">
                {/* Live Camera Preview Box */}
                <div className="relative mx-auto w-72 h-52 rounded-2xl overflow-hidden border-2 border-indigo-500/40 shadow-xl bg-slate-900">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-emerald-400 font-semibold border border-emerald-500/30">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Live Camera
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl text-sm font-medium">
                  <span>✓</span> Hardware Verified & Camera Active
                </div>
                <div>
                  <button
                    onClick={() => {
                      soundEffects.playStepSuccess();
                      setStep(2);
                    }}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 transition cursor-pointer"
                  >
                    Proceed to Calibration →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: 30-Second Bubble-Pop Calibration Game with Active Head Tracking */}
        {step === 2 && (
          <div className="relative min-h-[500px] rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between overflow-hidden backdrop-blur shadow-2xl">
            <div className="flex items-center justify-between z-20">
              <div>
                <h2 className="text-2xl font-bold text-white font-display">Pop the 5 Calibration Bubbles</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Move your head to glide the cyan glowing cursor over each bubble, or click them.
                </p>
              </div>

              {/* PiP Camera Preview */}
              {activeStream && (
                <div className="relative w-40 h-28 rounded-xl overflow-hidden border border-indigo-500/40 shadow-lg bg-black">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute bottom-1 right-1.5 text-[9px] bg-black/70 px-1.5 py-0.5 rounded text-indigo-300 font-medium">
                    Tracking Face
                  </div>
                </div>
              )}
            </div>

            {/* Interactive floating bubbles canvas */}
            <div className="absolute inset-0 pointer-events-none">
              {bubbles.map((b) =>
                !b.popped ? (
                  <button
                    key={b.id}
                    onClick={() => handlePopBubble(b.id)}
                    style={{ left: `${b.x}%`, top: `${b.y}%` }}
                    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 h-20 w-20 rounded-full bg-gradient-to-tr from-cyan-500/30 to-indigo-500/50 border-2 border-cyan-400 shadow-lg shadow-cyan-500/30 backdrop-blur-md flex flex-col items-center justify-center hover:scale-110 active:scale-95 transition cursor-pointer"
                  >
                    <span className="text-xl">🫧</span>
                    <span className="text-[10px] font-bold text-cyan-200 mt-0.5">{b.label}</span>
                  </button>
                ) : (
                  <div
                    key={b.id}
                    style={{ left: `${b.x}%`, top: `${b.y}%` }}
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 text-lg font-bold shadow-lg shadow-emerald-500/20"
                  >
                    ✓
                  </div>
                )
              )}
            </div>

            <div className="flex items-center justify-between z-20 pt-4 border-t border-slate-800/80">
              <span className="text-xs text-slate-300 font-medium bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                {bubbles.filter((b) => b.popped).length} of 5 bubbles popped
              </span>
              <button
                disabled={!allBubblesPopped}
                onClick={() => {
                  soundEffects.playStepSuccess();
                  setStep(3);
                }}
                className={`px-5 py-2.5 rounded-xl font-semibold text-xs transition cursor-pointer ${
                  allBubblesPopped
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                Next Step: Dwell & Nod →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dwell & Nod Selection */}
        {step === 3 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              🎯
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white font-display">Dwell or Nod to Click</h2>
              <p className="text-sm text-slate-400 mt-2">
                Rest your head cursor on any target for 800 ms to trigger a dwell click, or give a quick
                nod to select immediately without waiting.
              </p>
            </div>

            {/* Gesture Guide Demo Cards */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60">
                <div className="font-semibold text-xs text-indigo-400 flex items-center gap-1.5">
                  <span>⏱️</span> Dwell Click
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Keep your head cursor stationary over any button for <strong>800 ms</strong> to click automatically.
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60">
                <div className="font-semibold text-xs text-cyan-400 flex items-center gap-1.5">
                  <span>👇</span> Nod to Select
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  A subtle downward head nod immediately confirms the selection without waiting for the timer.
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60">
                <div className="font-semibold text-xs text-emerald-400 flex items-center gap-1.5">
                  <span>👁️</span> Double Blink = Click
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Blink both eyes twice quickly (within 500 ms) to click whatever your head cursor is pointing at.
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60">
                <div className="font-semibold text-xs text-amber-400 flex items-center gap-1.5">
                  <span>🌐</span> Voice Navigation
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Say <strong className="text-white">"open youtube"</strong> or <strong className="text-white">"search google"</strong> to navigate to any website hands-free.
                </div>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  soundEffects.playBubblePop();
                  setGestureTestPassed(true);
                }}
                className={`px-8 py-4 rounded-xl text-sm font-bold transition transform active:scale-95 cursor-pointer ${
                  gestureTestPassed
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/40"
                }`}
              >
                {gestureTestPassed ? "✓ Target Activated!" : "Test Target: Dwell (Hold Still) or Click Here"}
              </button>
            </div>

            <button
              disabled={!gestureTestPassed}
              onClick={() => {
                soundEffects.playStepSuccess();
                setStep(4);
              }}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition cursor-pointer ${
                gestureTestPassed
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Continue to Voice Testing →
            </button>
          </div>
        )}

        {/* Step 4: Voice Commands Test & Interactive Sandbox */}
        {step === 4 && (
          <div className="text-center space-y-5 max-w-2xl mx-auto">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              🎙️
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-white font-display">Voice Commands Sandbox</h2>
              <p className="text-xs text-slate-400 mt-1">
                Say commands naturally in English or Hindi. Handsfree translates your voice to action instantly.
              </p>
            </div>

            {/* Live Voice Status Pill */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isVoiceListening ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                <span>Mic: {isVoiceListening ? "Listening" : "Connecting..."}</span>
                <span className="text-slate-600">|</span>
                <span>Last Heard: </span>
                <span className="font-semibold text-cyan-300">
                  {lastTranscript ? `"${lastTranscript}"` : "(Speak into mic...)"}
                </span>
              </div>
              {lastExecutedCommand && (
                <div className="px-3 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-500/40 text-xs font-semibold text-indigo-300">
                  ⚡ {lastExecutedCommand}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const vm = getVoiceManager();
                  vm.stopListening();
                  setTimeout(() => vm.startListening(), 100);
                }}
                title="Restart speech recognition engine"
                className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition"
              >
                🔄 Reset Mic
              </button>
            </div>

            {voiceErrorMsg && (
              <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-lg inline-block">
                Mic status: {voiceErrorMsg} (recovering automatically...)
              </div>
            )}

            {/* Interactive Sandbox Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {/* 1. Voice Dictation Test Box */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <span>✍️</span> Voice Dictation Box
                    </label>
                    <button
                      type="button"
                      onClick={() => setSandboxInputText("")}
                      className="text-[10px] text-slate-400 hover:text-rose-400 transition"
                    >
                      Clear
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Say <strong className="text-white">"how are you"</strong> or any sentence to type directly into this box:
                  </p>
                  <textarea
                    rows={3}
                    value={sandboxInputText}
                    onChange={(e) => setSandboxInputText(e.target.value)}
                    placeholder='Say "how are you" to test voice typing...'
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition resize-none font-mono"
                  />
                </div>
                <div className="text-[10px] text-slate-500 mt-2">
                  Say <em>"new line"</em> or <em>"delete last word"</em> to edit.
                </div>
              </div>

              {/* 2. Scrollable Sandbox Box */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <span>📜</span> Scroll Test Area
                    </div>
                    <span className="text-[10px] text-slate-400">Say "scroll down"</span>
                  </div>
                  <div
                    ref={sandboxScrollRef}
                    className="h-28 overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-[11px] text-slate-300 space-y-2 scroll-smooth"
                  >
                    <p className="text-indigo-400 font-semibold">1. Start of scroll demo</p>
                    <p>Handsfree supports high-precision handsfree scrolling on web documents and containers.</p>
                    <p className="text-cyan-400">2. Say "scroll down" to glide through content smoothly.</p>
                    <p>Commands are processed locally with near-zero latency.</p>
                    <p className="text-emerald-400">3. Say "scroll up" to return to the top.</p>
                    <p className="text-slate-500">End of scroll demonstration area.</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2">
                  <span>Try: <em>"scroll down"</em> or <em>"scroll up"</em></span>
                  <div className="space-x-1">
                    <button
                      type="button"
                      onClick={() => sandboxScrollRef.current?.scrollBy({ top: 120, behavior: "smooth" })}
                      className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 text-[10px]"
                    >
                      ↓ Down
                    </button>
                    <button
                      type="button"
                      onClick={() => sandboxScrollRef.current?.scrollBy({ top: -120, behavior: "smooth" })}
                      className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 text-[10px]"
                    >
                      ↑ Up
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Numbered Targets (Includes #14!) */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 text-left">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>🔢</span> Numbered Target Badges (Say "click 14" or "14 number")
                </div>
                <span className="text-[10px] text-indigo-400 font-medium">Say number to trigger</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {[1, 2, 3, 4, 10, 14].map((n) => {
                  const isSelected = activeNumberBadge === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setActiveNumberBadge(n);
                        soundEffects.playStepSuccess();
                        setLastExecutedCommand(`Clicked Badge #${n}`);
                        setTimeout(() => setActiveNumberBadge(null), 1400);
                      }}
                      className={`relative py-2 px-3 rounded-lg border text-center transition cursor-pointer ${
                        isSelected
                          ? "bg-emerald-500/30 border-emerald-400 text-emerald-200 scale-105 shadow-md shadow-emerald-500/20"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <span className="absolute -top-1.5 -left-1.5 bg-indigo-600 text-white font-bold text-[9px] rounded-full w-4 h-4 flex items-center justify-center shadow">
                        {n}
                      </span>
                      <span className="text-xs font-medium">Target {n}</span>
                      {isSelected && <span className="block text-[9px] text-emerald-400 font-bold">✓ CLICKED</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick voice command cheatsheet buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
              {[
                { en: 'Say "scroll down"', act: () => sandboxScrollRef.current?.scrollBy({ top: 120, behavior: "smooth" }) },
                { en: 'Say "how are you"', act: () => setSandboxInputText((p) => (p ? `${p} how are you` : "how are you")) },
                { en: 'Say "click 14"', act: () => { setActiveNumberBadge(14); soundEffects.playStepSuccess(); setTimeout(() => setActiveNumberBadge(null), 1400); } },
                { en: 'Say "delete last word"', act: () => setSandboxInputText((p) => p.trimEnd().split(" ").slice(0, -1).join(" ")) },
                { en: 'Say "open youtube"', act: () => { setLastOpenedUrl("https://www.youtube.com"); setLastExecutedCommand("Navigate → youtube.com"); soundEffects.playStepSuccess(); setVoiceTestPassed(true); } },
                { en: 'Say "open google"', act: () => { setLastOpenedUrl("https://www.google.com"); setLastExecutedCommand("Navigate → google.com"); soundEffects.playStepSuccess(); setVoiceTestPassed(true); } },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    item.act();
                    soundEffects.playBubblePop();
                    setVoiceTestPassed(true);
                  }}
                  className="p-2.5 rounded-lg border border-slate-800/80 bg-slate-900/40 hover:border-indigo-500/50 cursor-pointer transition text-center"
                >
                  <div className="font-semibold text-[11px] text-slate-200">{item.en}</div>
                  <div className="text-[9px] text-indigo-400 mt-0.5">Click or speak to test</div>
                </div>
              ))}
            </div>

            {/* Website navigation preview banner */}
            {lastOpenedUrl && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                <span>🌐</span>
                <span>Navigating to <strong className="text-white">{lastOpenedUrl}</strong>…</span>
              </div>
            )}

            {voiceTestPassed && (
              <div className="text-xs text-emerald-400 font-medium">
                ✓ Voice command and dictation tested successfully!
              </div>
            )}

            <button
              disabled={!voiceTestPassed}
              onClick={() => {
                soundEffects.playStepSuccess();
                setStep(5);
              }}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition cursor-pointer ${
                voiceTestPassed
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Complete Tutorial →
            </button>
          </div>
        )}

        {/* Step 5: Ready & Celebration */}
        {step === 5 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-4xl text-emerald-400">
              🎉
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white font-display">You're All Set!</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Handsfree is fully configured and ready. You can pause listening at any time by saying
                "pause listening", or adjust dwell sensitivity in the Options control panel.
              </p>
            </div>

            <div className="pt-4">
              <button
                onClick={handleFinish}
                className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                Start Browsing Handsfree ✨
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer Notice */}
      <footer className="px-8 py-4 border-t border-slate-800/80 bg-slate-900/20 text-center text-xs text-slate-500">
        Privacy Guaranteed • Real-time on-device computer vision • Handsfree v0.1.0
      </footer>
    </div>
  );
};
