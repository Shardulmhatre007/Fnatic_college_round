import React, { useEffect, useState } from "react";
import type { HandsfreeSettings, Locale } from "@/shared/types";
import { loadSettings, saveSettings } from "@/shared/storage";

export const SidePanelApp: React.FC = () => {
  const [settings, setSettings] = useState<HandsfreeSettings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

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

  const setLocale = async (locale: Locale) => {
    if (!settings) return;
    setSettings({ ...settings, locale });
    await saveSettings({ locale });
  };

  if (!settings) {
    return (
      <div className="p-4 text-xs text-slate-400">Loading Handsfree…</div>
    );
  }

  return (
    <div className="p-5 font-sans space-y-5 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
            H
          </div>
          <span className="font-semibold text-sm">Handsfree</span>
        </div>
        <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
          Active
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div>
            <div className="text-xs font-semibold">Webcam Tracking</div>
            <div className="text-[11px] text-slate-400">Head pose & cursor</div>
          </div>
          <button
            onClick={toggleTracking}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              settings.trackingEnabled
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {settings.trackingEnabled ? "ON" : "OFF"}
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div>
            <div className="text-xs font-semibold">Voice Commands</div>
            <div className="text-[11px] text-slate-400">Speech recognition</div>
          </div>
          <button
            onClick={toggleVoice}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              settings.voiceEnabled
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {settings.voiceEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
          Language
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setLocale("en")}
            className={`py-1.5 px-2 text-xs rounded border transition ${
              settings.locale === "en"
                ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 font-medium"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLocale("hi")}
            className={`py-1.5 px-2 text-xs rounded border transition ${
              settings.locale === "hi"
                ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 font-medium"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            हिंदी
          </button>
        </div>
      </div>
    </div>
  );
};
