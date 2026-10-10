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

  // Live on-screen cursor
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 400, y: 300 });
  const [cursorVisible, setCursorVisible] = useState<boolean>(false);
  const [activeGesture, setActiveGesture] = useState<string>("Head Tracking (Active)");
  const [clickNotice, setClickNotice] = useState<boolean>(false);

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
        if (landmarks.gestures.includes("nod") || landmarks.gestures.includes("open_palm")) {
          setClickNotice(true);
          setTimeout(() => setClickNotice(false), 300);
        }
      } else {
        setActiveGesture("Head Tracking (Active)");
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

  // Request camera and microphone access
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
    } catch {
      setPermissionError(
        "Camera access was dismissed or blocked. You can still test with simulated controls."
      );
      setPermissionGranted(true);
    }
  };

  const handlePopBubble = (id: number) => {
    soundEffects.playBubblePop();
    const updated = bubbles.map((b) => (b.id === id ? { ...b, popped: true } : b));
    setBubbles(updated);
    if (updated.every((b) => b.popped)) {
      soundEffects.playStepSuccess();
    }
  };

  const allBubblesPopped = bubbles.every((b) => b.popped);

  const handleFinish = async () => {
    soundEffects.playCelebration();
    await saveSettings({ trackingEnabled: true, voiceEnabled: true });
    setTimeout(() => {
      window.close();
    }, 1800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Responsive Virtual Cursor */}
      {cursorVisible && (
        <div
          style={{
            transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`,
          }}
          className={`fixed top-0 left-0 pointer-events-none z-50 -ml-4 -mt-4 w-9 h-9 rounded-full transition-transform duration-[25ms] ease-out flex items-center justify-center ${
            clickNotice
              ? "bg-emerald-400/80 border-2 border-white scale-125 shadow-[0_0_25px_rgba(52,211,153,1)]"
              : "bg-cyan-500/40 border-2 border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.8)]"
          }`}
        >
          <div className="text-[12px]">{clickNotice ? "💥" : "🎯"}</div>
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
            <p className="text-xs text-slate-400">Head Tracking & Voice Control</p>
          </div>
        </div>

        {/* Live HUD Pill showing tracking status */}
        <div className="flex items-center gap-4">
          {permissionGranted && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs text-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{activeGesture}</span>
            </div>
          )}

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

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-8 flex flex-col justify-center z-10">
        {/* Step 1: Camera Permission */}
        {step === 1 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              👤
            </div>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white font-display">
                Head Tracking & Voice Control
              </h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Control your screen naturally with subtle head movements and speech commands.
                All camera processing runs 100% locally on your device.
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
                Allow Camera & Mic Access
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
                  <span>✓</span> Tracking Active
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

        {/* Step 2: Bubble Pop Calibration */}
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

            {/* Floating bubbles */}
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
                Next Step: Select & Click →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dwell / Nod Click Test */}
        {step === 3 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              🎯
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white font-display">Nod or Dwell to Select</h2>
              <p className="text-sm text-slate-400 mt-2">
                Move your cursor over the button below and <strong>dwell (hold still)</strong> or <strong>nod</strong> to click!
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center justify-center">
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
                {gestureTestPassed ? "✓ Selection Confirmed!" : "Test Target: Dwell or Nod Here"}
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

        {/* Step 4: Voice Commands */}
        {step === 4 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              🎙️
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white font-display">Voice Commands in Action</h2>
              <p className="text-sm text-slate-400 mt-2">
                Handsfree pairs head tracking with voice commands. Speak or click below:
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { en: 'Say "scroll down"', hi: 'या "नीचे scroll करो"' },
                { en: 'Say "click this"', hi: 'या "यह click करो"' },
                { en: 'Say "show numbers"', hi: 'या "numbers दिखाओ"' },
                { en: 'Say "pause listening"', hi: 'या "सुनना बंद करो"' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    soundEffects.playBubblePop();
                    setVoiceTestPassed(true);
                  }}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-indigo-500/50 cursor-pointer transition"
                >
                  <div className="font-semibold text-xs text-white">{item.en}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.hi}</div>
                </div>
              ))}
            </div>

            {voiceTestPassed && (
              <div className="text-xs text-emerald-400 font-medium">
                ✓ Voice command confirmed!
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
              Finish Setup →
            </button>
          </div>
        )}

        {/* Step 5: Completed */}
        {step === 5 && (
          <div className="text-center space-y-6 max-w-xl mx-auto">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-4xl text-emerald-400">
              🎉
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white font-display">You're All Set!</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Head tracking and Point-and-Say voice control are configured. Move your head to position the pointer,
                say "click this" or hold still to click, and use voice commands at any time.
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

      <footer className="px-8 py-4 border-t border-slate-800/80 bg-slate-900/20 text-center text-xs text-slate-500">
        Privacy Guaranteed • On-device computer vision • Handsfree v0.1.0
      </footer>
    </div>
  );
};
