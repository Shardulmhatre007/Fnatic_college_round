import React from "react";
import ReactDOM from "react-dom/client";
import { SidePanelApp } from "./App";
import "../options/style.css";

const rootElement = document.getElementById("sidepanel-root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SidePanelApp />
    </React.StrictMode>
  );
}
