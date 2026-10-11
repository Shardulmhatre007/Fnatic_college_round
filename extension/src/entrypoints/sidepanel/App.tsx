import React, { useEffect, useRef, useState } from "react";
import type { HandsfreeSettings, LandmarkResult, Locale } from "@/shared/types";
import { loadSettings, saveSettings } from "@/shared/storage";
import { FastCameraTracker } from "@/modules/tracking/fast-tracker";
import {
  MediaPipeFaceTracker,
  type HeadTracker,
} from "@/modules/tracking/mediapipe-face-tracker";

export const SidePanelApp: React.FC = () => {
  const [settings, setSettings] = useState<HandsfreeSettings | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [activeGesture, setActiveGesture] = useState<string>("Ready");
  const [lastBlinkTime, setLastBlinkTime] = useState<number>(0);
  const [activeTabTitle, setActiveTabTitle] = useState<string>("Active Tab");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<HeadTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);

    const updateTabInfo = () => {
      void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.url?.startsWith("chrome://")) {
          setActiveTabTitle("Chrome Home / Settings (Restricted)");
        } else if (tab?.title) {
          setActiveTabTitle(tab.title);
        }
      });
    };

    updateTabInfo();

    const handleActivated = () => updateTabInfo();
    const handleUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.title || changeInfo.url) updateTabInfo();
    };

    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, []);

  // Manage webcam tracking loop directly inside the side panel
  useEffect(() => {
    if (!settings?.trackingEnabled) {
      // Stop tracking
      if (trackerRef.current) {
        trackerRef.current.stop();
        trackerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
      setActiveGesture("Stopped");
      return;
    }

    let isMounted = true;

    const startTracker = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }

        setIsCameraActive(true);

        const handleLandmarks = (landmarks: LandmarkResult) => {
          if (!isMounted) return;

          if (landmarks.gestures.length > 0) {
            setActiveGesture(landmarks.gestures.join(", "));
            if (landmarks.gestures.includes("blink_both")) {
              setLastBlinkTime(Date.now());
            }
          } else {
            setActiveGesture("Tracking Head");
          }

          // Forward landmarks to background -> active tab content script
          try {
            void chrome.runtime.sendMessage({
              type: "TRACKING_LANDMARKS",
              payload: landmarks,
            });
          } catch {
            // Background script may be re-initializing
          }
        };

        if (video) {
          const faceTracker = new MediaPipeFaceTracker(video);
          try {
            await faceTracker.load();
            if (!isMounted) return;
            faceTracker.start(handleLandmarks);
            trackerRef.current = faceTracker;
          } catch {
            if (!isMounted) return;
            const optical = new FastCameraTracker(video);
            optical.start(handleLandmarks);
            trackerRef.current = optical;
          }
        }
      } catch (err) {
        console.warn("Unable to start camera tracking in side panel:", err);
        setIsCameraActive(false);
        setActiveGesture("Camera Permission Required");
      }
    };

    void startTracker();

    return () => {
      isMounted = false;
      if (trackerRef.current) {
        trackerRef.current.stop();
        trackerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
    };
  }, [settings?.trackingEnabled]);

  const toggleTracking = async () => {
    if (!settings) return;
    const trackingEnabled = !settings.trackingEnabled;
    setSettings({ ...settings, trackingEnabled });
    await saveSettings({ trackingEnabled });
  };

  const toggleVoice = async () => {
    if (!settings) return;
    const voiceEnabled = !settings.voiceEnabled;
    setSettings({ ...settings, voiceEnabled });
    await saveSettings({ voiceEnabled });
  };

  const toggleDwell = async () => {
    if (!settings) return;
    const dwellEnabled = !settings.dwellEnabled;
    setSettings({ ...settings, dwellEnabled });
    await saveSettings({ dwellEnabled });
  };

  const updateDwellMs = async (dwellMs: number) => {
    if (!settings) return;
    setSettings({ ...settings, dwellMs });
    await saveSettings({ dwellMs });
  };

  const setLocale = async (locale: Locale) => {
    if (!settings) return;
    setSettings({ ...settings, locale });
    await saveSettings({ locale });
  };

  const handleRecalibrate = () => {
    if (trackerRef.current) {
      trackerRef.current.calibrateNeutral();
      setActiveGesture("Calibrated Center!");
      setTimeout(() => setActiveGesture("Tracking Head"), 1200);
    }
  };

  if (!settings) {
    return (
      <div className="p-4 text-xs text-slate-400">Loading Handsfree…</div>
    );
  }

  return (
    <div className="p-4 font-sans space-y-4 bg-slate-950 text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center font-bold text-xs text-white shadow">
            H
          </div>
          <div>
            <div className="font-semibold text-xs text-white leading-tight">Handsfree Companion</div>
            <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{activeTabTitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              settings.trackingEnabled && isCameraActive ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span className="text-[11px] font-medium text-slate-400">
            {settings.trackingEnabled ? (isCameraActive ? "Live" : "Starting") : "Paused"}
          </span>
        </div>
      </div>

      {activeTabTitle.includes("Restricted") && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 leading-normal">
          <span className="font-semibold">⚠️ Browser Protected Page:</span> Chrome security blocks extensions from drawing or running scripts on internal <code className="font-mono text-amber-200">chrome://</code> pages (e.g. Home / New Tab). Open any regular website like <span className="underline cursor-pointer" onClick={() => void chrome.tabs.create({ url: "https://www.youtube.com" })}>YouTube</span> or Google to use head & voice browsing.
        </div>
      )}

      {/* Camera Live Preview & Neutral Calibration */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video flex items-center justify-center shadow-inner">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover scale-x-[-1] ${!isCameraActive ? "hidden" : ""}`}
        />
        {!isCameraActive && (
          <div className="text-center p-3">
            <div className="text-xs text-slate-400">
              {settings.trackingEnabled ? "Starting camera…" : "Tracking paused"}
            </div>
            <button
              onClick={toggleTracking}
              className="mt-2 text-[11px] px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-medium"
            >
              Resume Tracking
            </button>
          </div>
        )}
        {isCameraActive && (
          <>
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur px-2 py-0.5 rounded text-[10px] text-cyan-300 font-mono">
              {activeGesture}
            </div>
            <button
              onClick={handleRecalibrate}
              title="Calibrate current position as center"
              className="absolute bottom-2 right-2 bg-indigo-600/80 hover:bg-indigo-600 text-[10px] px-2 py-1 rounded text-white font-medium shadow backdrop-blur transition"
            >
              Center Cursor
            </button>
          </>
        )}
      </div>

      {/* Main Switchboard */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div>
            <div className="text-xs font-semibold">Webcam Tracking</div>
            <div className="text-[10px] text-slate-400">Head navigation & blink click</div>
          </div>
          <button
            onClick={toggleTracking}
            className={`px-3 py-1 rounded text-xs font-semibold transition ${
              settings.trackingEnabled
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {settings.trackingEnabled ? "RUNNING" : "STOPPED"}
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div>
            <div className="text-xs font-semibold">Voice Commands</div>
            <div className="text-[10px] text-slate-400">Speech recognition on every tab</div>
          </div>
          <button
            onClick={toggleVoice}
            className={`px-3 py-1 rounded text-xs font-semibold transition ${
              settings.voiceEnabled
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {settings.voiceEnabled ? "ACTIVE" : "OFF"}
          </button>
        </div>

        {/* Dwell Click Toggle & Timer Slider */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <span>Dwell Auto-Click</span>
                <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-mono">
                  {settings.dwellMs ?? 1200}ms
                </span>
              </div>
              <div className="text-[10px] text-slate-400">Hover stationary to click</div>
            </div>
            <button
              onClick={toggleDwell}
              className={`px-3 py-1 rounded text-xs font-semibold transition ${
                settings.dwellEnabled
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {settings.dwellEnabled ? "ENABLED" : "DISABLED"}
            </button>
          </div>

          {settings.dwellEnabled && (
            <div className="space-y-1 pt-1 border-t border-slate-800/60">
              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                <span>Dwell duration</span>
                <span className="text-indigo-400 font-mono font-semibold">{settings.dwellMs ?? 1200} ms</span>
              </div>
              <input
                type="range"
                min={800}
                max={3000}
                step={100}
                value={settings.dwellMs ?? 1200}
                onChange={(e) => void updateDwellMs(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>800ms (Fast)</span>
                <span>3000ms (Slow)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gesture Guide & Cheat Sheet */}
      <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 space-y-2.5">
        <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
          <span>Basic Gestures</span>
          <span className="text-[9px] text-indigo-400 uppercase tracking-wider font-mono">Controls</span>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">👤</span>
              <span className="text-slate-200 text-[11px]">Head movement</span>
            </div>
            <span className="text-[10px] font-medium text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
              Moves Cursor
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">😉</span>
              <span className="text-slate-200 text-[11px]">Blink twice (Double Blink)</span>
            </div>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors ${
                Date.now() - lastBlinkTime < 800
                  ? "bg-emerald-500 text-white border-emerald-400"
                  : "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
              }`}
            >
              Left Click / Select
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">⏱️</span>
              <span className="text-slate-200 text-[11px]">Dwell on element (hover)</span>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
              settings.dwellEnabled
                ? "text-indigo-300 bg-indigo-950/60 border-indigo-700/60"
                : "text-slate-500 bg-slate-900 border-slate-800"
            }`}>
              {settings.dwellEnabled ? `Dwell Click (${settings.dwellMs ?? 1200}ms)` : "Disabled"}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">🙇</span>
              <span className="text-slate-200 text-[11px]">Nod head down</span>
            </div>
            <span className="text-[10px] font-medium text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
              Confirm / Click
            </span>
          </div>
        </div>
      </div>

      {/* Voice Commands Cheat Sheet */}
      <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 space-y-2.5">
        <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
          <span>Voice Commands</span>
          <span className="text-[9px] text-slate-400">English & हिंदी</span>
        </div>
        <div className="space-y-1.5 text-[11px] text-slate-300">
          <div className="flex justify-between py-1 border-b border-slate-800/50">
            <span className="font-mono text-slate-400">"open youtube" / "search youtube"</span>
            <span className="text-slate-400">Opens YouTube</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800/50">
            <span className="font-mono text-slate-400">"open side panel" / "panel kholo"</span>
            <span className="text-slate-400">Opens Side Panel</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800/50">
            <span className="font-mono text-slate-400">"show numbers" / "नंबर दिखाओ"</span>
            <span className="text-slate-400">Overlays badges</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800/50">
            <span className="font-mono text-slate-400">"click [number]" / "14 number"</span>
            <span className="text-slate-400">Clicks badge</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800/50">
            <span className="font-mono text-slate-400">"scroll down" / "नीचे स्क्रॉल"</span>
            <span className="text-slate-400">Scrolls page</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="font-mono text-slate-400">"pause listening" / "so jao"</span>
            <span className="text-slate-400">Pauses mic</span>
          </div>
        </div>
      </div>

      {/* Language Selector */}
      <div>
        <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
          Voice Language
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setLocale("en")}
            className={`py-1.5 px-2 text-xs rounded border transition ${
              settings.locale === "en"
                ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 font-semibold"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
            }`}
          >
            English (en-US)
          </button>
          <button
            onClick={() => setLocale("hi")}
            className={`py-1.5 px-2 text-xs rounded border transition ${
              settings.locale === "hi"
                ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 font-semibold"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
            }`}
          >
            हिंदी (hi-IN)
          </button>
        </div>
      </div>
    </div>
  );
};
