import React, { useEffect, useState } from "react";
import type { HandsfreeSettings, Locale, ProfileId, UserProfile } from "@/shared/types";
import { loadSettings, saveSettings } from "@/shared/storage";
import { DEFAULT_COMMANDS } from "@/modules/commands/index";

export const App: React.FC = () => {
  const [settings, setSettings] = useState<HandsfreeSettings | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "profiles" | "commands" | "rituals">("general");
  const [savedNotification, setSavedNotification] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      // Ensure default commands populate if list is empty
      if (s.commands.length === 0) {
        s.commands = DEFAULT_COMMANDS;
      }
      setSettings(s);
    });
  }, []);

  const handleUpdate = async (patch: Partial<HandsfreeSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await saveSettings(patch);
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2000);
  };

  const handleProfileUpdate = async (field: keyof UserProfile, value: unknown) => {
    if (!settings) return;
    const activeProfIndex = settings.profiles.findIndex((p) => p.id === settings.activeProfileId);
    if (activeProfIndex === -1) return;

    const newProfiles = [...settings.profiles];
    const current = newProfiles[activeProfIndex];
    if (!current) return;

    newProfiles[activeProfIndex] = {
      ...current,
      [field]: value,
    };

    await handleUpdate({ profiles: newProfiles });
  };

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span>Loading Handsfree settings…</span>
        </div>
      </div>
    );
  }

  const activeProfile =
    settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800/80 bg-slate-900/40 p-6 flex flex-col justify-between backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-bold text-white text-lg">
              H
            </div>
            <div>
              <h1 className="font-semibold tracking-wide text-base">Handsfree</h1>
              <p className="text-xs text-slate-400">Control Panel v0.1.0</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("general")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "general"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <span>⚙️</span> General & Audio
            </button>
            <button
              onClick={() => setActiveTab("profiles")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "profiles"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <span>👤</span> Profiles & Dwell
            </button>
            <button
              onClick={() => setActiveTab("commands")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "commands"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <span>🎙️</span> Voice Commands
            </button>
            <button
              onClick={() => setActiveTab("rituals")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "rituals"
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <span>⚡</span> Rituals & Macros
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-800/60 text-xs text-slate-500">
          <p>Camera feed stays 100% on-device.</p>
          <p className="mt-1">Built for accessibility.</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10 max-w-4xl">
        <header className="flex items-center justify-between pb-6 border-b border-slate-800/80 mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white capitalize">
              {activeTab === "general" && "General Settings & Controls"}
              {activeTab === "profiles" && "Motor Profiles & Dwell Sensitivity"}
              {activeTab === "commands" && "Voice Commands Grammar"}
              {activeTab === "rituals" && "Automation Rituals"}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Changes are immediately synchronized across all tabs and the background worker.
            </p>
          </div>

          {savedNotification && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-medium animate-fade-in">
              <span>✓</span> Saved
            </div>
          )}
        </header>

        {/* Tab 1: General & Engine Toggles */}
        {activeTab === "general" && (
          <section className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 backdrop-blur">
              <h3 className="text-base font-semibold text-white mb-4">Core Engine Toggles</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/50 hover:border-slate-700 transition cursor-pointer">
                  <div>
                    <span className="font-medium text-sm block">Webcam Tracking</span>
                    <span className="text-xs text-slate-400">
                      Enable head pose and cursor tracking via camera
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.trackingEnabled}
                    onChange={(e) => handleUpdate({ trackingEnabled: e.target.checked })}
                    className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/50 hover:border-slate-700 transition cursor-pointer">
                  <div>
                    <span className="font-medium text-sm block">Voice Recognition</span>
                    <span className="text-xs text-slate-400">
                      Listen for browser control phrases and dictation
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voiceEnabled}
                    onChange={(e) => handleUpdate({ voiceEnabled: e.target.checked })}
                    className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/50 hover:border-slate-700 transition cursor-pointer">
                  <div>
                    <span className="font-medium text-sm block">Private Offline Voice</span>
                    <span className="text-xs text-slate-400">
                      Keep all speech processing on-device using offline models
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.offlineMode}
                    onChange={(e) => handleUpdate({ offlineMode: e.target.checked })}
                    className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 backdrop-blur">
              <h3 className="text-base font-semibold text-white mb-4">Language & Locale</h3>
              <div className="max-w-xs">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Voice & Interface Language
                </label>
                <select
                  value={settings.locale}
                  onChange={(e) => handleUpdate({ locale: e.target.value as Locale })}
                  className="w-full bg-slate-950 border border-slate-800 text-sm rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="en">English (en-IN / en-US)</option>
                  <option value="hi">हिंदी (Hindi / Hinglish)</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {/* Tab 2: Profiles & Dwell */}
        {activeTab === "profiles" && (
          <section className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">Active Profile</h3>
                <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full font-medium">
                  {activeProfile?.name}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { id: "default", label: "Default Standard" },
                  { id: "tremor", label: "Tremor Dampened" },
                  { id: "one_handed", label: "One Handed / Head Only" },
                ].map((prof) => (
                  <button
                    key={prof.id}
                    onClick={() => handleProfileUpdate("base", prof.id as ProfileId)}
                    className={`p-3 rounded-lg border text-left text-xs font-medium transition ${
                      activeProfile?.base === prof.id
                        ? "bg-indigo-600/20 border-indigo-500 text-white"
                        : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {prof.label}
                  </button>
                ))}
              </div>

              <div className="space-y-6 border-t border-slate-800/60 pt-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-300">Dwell Click Duration</span>
                    <span className="text-indigo-400 font-semibold">{activeProfile?.dwellMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="400"
                    max="1800"
                    step="50"
                    value={activeProfile?.dwellMs ?? 800}
                    onChange={(e) => handleProfileUpdate("dwellMs", Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>400ms (Fast)</span>
                    <span>800ms (Default)</span>
                    <span>1800ms (Careful)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-300">Filter Smoothing Beta</span>
                    <span className="text-indigo-400 font-semibold">
                      {activeProfile?.smoothingBeta}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.001"
                    max="0.02"
                    step="0.001"
                    value={activeProfile?.smoothingBeta ?? 0.007}
                    onChange={(e) => handleProfileUpdate("smoothingBeta", Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Tab 3: Commands */}
        {activeTab === "commands" && (
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 backdrop-blur">
            <h3 className="text-base font-semibold text-white mb-4">Command Catalogue</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {(settings.commands.length > 0 ? settings.commands : DEFAULT_COMMANDS).map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/50"
                >
                  <div>
                    <span className="font-semibold text-sm text-slate-200">"{cmd.phrase}"</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-mono bg-slate-800/60 text-slate-400 px-2 py-0.5 rounded">
                        {cmd.action.type}
                      </span>
                      {cmd.aliases && (
                        <span className="text-[11px] text-slate-500">
                          Aliases: {Object.values(cmd.aliases).flat().slice(0, 3).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded font-medium">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tab 4: Rituals */}
        {activeTab === "rituals" && (
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 backdrop-blur text-center py-12">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-base font-semibold text-white">Automation Rituals</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">
              Record macro step sequences triggered by voice or gesture. Multi-step workflows and
              confirmation gates activate in Milestone M5.
            </p>
          </section>
        )}
      </main>
    </div>
  );
};
