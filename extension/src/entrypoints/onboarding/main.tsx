import React from "react";
import ReactDOM from "react-dom/client";
import { OnboardingApp } from "./App";
import "../options/style.css";

const rootElement = document.getElementById("onboarding-root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <OnboardingApp />
    </React.StrictMode>
  );
}
