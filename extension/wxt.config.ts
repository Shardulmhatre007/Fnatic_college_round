import { defineConfig } from "wxt";

/** WXT build configuration for the Handsfree extension. */
export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "Handsfree",
    version: "0.1.0",
    description:
      "Browse the web with your webcam and voice. Built for users with motor impairments.",
    // MediaPipe compiles a bundled WebAssembly model on the extension page.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    permissions: [
      "storage",
      "tabs",
      "activeTab",
      "offscreen",
      "sidePanel",
      "scripting",
      "microphone",
    ],
    // host_permissions are kept minimal; content script matches cover page access.
    host_permissions: ["<all_urls>"],
    side_panel: {
      default_path: "sidepanel.html",
    },
    action: {
      default_title: "Handsfree",
      default_popup: "",
    },
  },
  // Vite config shared across all entry points.
  vite: () => ({
    build: {
      target: "esnext",
    },
  }),
});
