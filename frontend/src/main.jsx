import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Wand-Tablet laeuft unbeaufsichtigt: Statt leerem Blinken bei einem
// Runtime-Fehler eine bescheidene Fehlerkarte mit Neuladen-Button zeigen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="settings-wrap">
        <div className="settings-card">
          <h1>QuoteBox</h1>
          <p className="loading-note">Etwas ist schiefgelaufen.</p>
          <button type="button" className="save-btn" onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
