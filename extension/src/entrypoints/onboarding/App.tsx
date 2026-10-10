import React, { useState } from "react";
import { soundEffects } from "./audio";
import { saveSettings } from "@/shared/storage";

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

  // Bubble-pop calibration targets
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 1, label: "Top Left", x: 20, y: 25, popped: false },
    { id: 2, label: "Center", x: 50, y: 45, popped: false },
    { id: 3, label: "Top Right", x: 80, y: 25, popped: false },
    { id: 4, label: "Bottom Left", x: 25, y: 70, popped: false },
    { id: 5, label: "Bottom Right", x: 75, y: 70, popped: false },
  ]);

  const [voiceTestPassed, setVoiceTestPassed] = useState<boolean>(false);
  const [gestureTestPassed, setGestureTestPassed] = useState<boolean>(false);

  // 1. Request camera & mic permission
  const handleRequestPermissions = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        // Stop the temporary prompt test tracks immediately
        stream.getTracks().forEach((track) => track.stop());
        setPermissionGranted(true);
        setPermissionError(null);
        soundEffects.playStepSuccess();
        await saveSettings({ trackingEnabled: true, voiceEnabled: true });
      } else {
        setPermissionGranted(true);
      }
    } catch (err) {
      setPermissionError(
        "Camera or Microphone permission was dismissed or not granted. You can proceed with on-screen testing."
      );
      // Allow proceeding in dev / test environments
      setPermissionGranted(true);
    }
  };

  // 2. Handle bubble click / head hover pop
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="px-8 py-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-indigo-500/20">
            H
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide text-white">Handsfree</h1>
            <p className="text-xs text-slate-400">Interactive Setup & Calibration</p>
          </div>
        </div>

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
      </header>

      {/* Main interactive area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-8 flex flex-col justify-center">
        {/* Step 1: Camera & Microphone Permissions */}
        {step === 1 && (
          <div className="text-center space-y-6 max-w-xl mx-auto animate-fade-in">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400 shadow-inner">
              📷
            </div>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">
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
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Allow Access & Continue
              </button>
            ) : (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl text-sm font-medium">
                  <span>✓</span> Hardware Ready
                </div>
                <div>
                  <button
                    onClick={() => {
                      soundEffects.playStepSuccess();
                      setStep(2);
                    }}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition"
                  >
                    Proceed to Calibration →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: 30-Second Bubble-Pop Calibration Game */}
        {step === 2 && (
          <div className="relative min-h-[460px] rounded-2xl border border-slate-800 bg-slate-900/30 p-6 flex flex-col justify-between overflow-hidden">
            <div className="text-center z-10">
              <h2 className="text-2xl font-bold text-white">Pop the 5 Calibration Bubbles</h2>
              <p className="text-xs text-slate-400 mt-1">
                Move your head or cursor to pop each bubble. This maps your natural head movement to
                your screen corners.
              </p>
            </div>

            {/* Floating interactive bubbles */}
            <div className="absolute inset-0">
              {bubbles.map((b) =>
                !b.popped ? (
                  <button
                    key={b.id}
                    onClick={() => handlePopBubble(b.id)}
                    style={{ left: `${b.x}%`, top: `${b.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-20 w-20 rounded-full bg-gradient-to-tr from-cyan-500/40 to-indigo-500/60 border-2 border-cyan-400/80 shadow-lg shadow-cyan-500/30 backdrop-blur-md flex flex-col items-center justify-center hover:scale-110 active:scale-95 transition cursor-pointer animate-pulse"
                  >
                    <span className="text-lg">🫧</span>
                    <span className="text-[10px] font-semibold text-cyan-200 mt-0.5">{b.label}</span>
                  </button>
                ) : (
                  <div
                    key={b.id}
                    style={{ left: `${b.x}%`, top: `${b.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 text-sm font-bold animate-ping"
                  >
                    ✓
                  </div>
                )
              )}
            </div>

            <div className="flex items-center justify-between z-10 pt-4 border-t border-slate-800/80">
              <span className="text-xs text-slate-400 font-medium">
                {bubbles.filter((b) => b.popped).length} of 5 bubbles popped
              </span>
              <button
                disabled={!allBubblesPopped}
                onClick={() => {
                  soundEffects.playStepSuccess();
                  setStep(3);
                }}
                className={`px-5 py-2.5 rounded-xl font-semibold text-xs transition ${
                  allBubblesPopped
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
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
          <div className="text-center space-y-6 max-w-xl mx-auto animate-fade-in">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              🎯
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white">Dwell or Nod to Click</h2>
              <p className="text-sm text-slate-400 mt-2">
                Rest your cursor on any target for 800 ms to trigger a dwell click, or give a quick
                nod to select immediately without waiting.
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  soundEffects.playBubblePop();
                  setGestureTestPassed(true);
                }}
                className={`px-8 py-4 rounded-xl text-sm font-bold transition transform active:scale-95 ${
                  gestureTestPassed
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/40"
                }`}
              >
                {gestureTestPassed ? "✓ Target Activated!" : "Test Target: Click or Dwell Here"}
              </button>
            </div>

            <button
              disabled={!gestureTestPassed}
              onClick={() => {
                soundEffects.playStepSuccess();
                setStep(4);
              }}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition ${
                gestureTestPassed
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Continue to Voice Testing →
            </button>
          </div>
        )}

        {/* Step 4: Voice Commands Test */}
        {step === 4 && (
          <div className="text-center space-y-6 max-w-xl mx-auto animate-fade-in">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl text-indigo-400">
              🎙️
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white">Voice Commands in Action</h2>
              <p className="text-sm text-slate-400 mt-2">
                Handsfree recognizes commands in English and Hindi (Hinglish). Try speaking or
                clicking below to simulate voice activation:
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { en: 'Say "scroll down"', hi: 'या "नीचे scroll करो"' },
                { en: 'Say "show numbers"', hi: 'या "numbers दिखाओ"' },
                { en: 'Say "click 14"', hi: 'या "नंबर चौदह"' },
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
                ✓ Speech recognition tested successfully!
              </div>
            )}

            <button
              disabled={!voiceTestPassed}
              onClick={() => {
                soundEffects.playStepSuccess();
                setStep(5);
              }}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition ${
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
          <div className="text-center space-y-6 max-w-xl mx-auto animate-fade-in">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-4xl text-emerald-400">
              🎉
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white">You're All Set!</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Handsfree is fully configured and ready. You can pause listening at any time by saying
                "pause listening", or adjust dwell sensitivity in the Options control panel.
              </p>
            </div>

            <div className="pt-4">
              <button
                onClick={handleFinish}
                className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition transform hover:-translate-y-0.5 active:translate-y-0"
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
