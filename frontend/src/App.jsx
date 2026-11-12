import DisplayPage from "./pages/DisplayPage";
import SettingsPage from "./pages/SettingsPage";

// Zwei Seiten, keine Router-Abhängigkeit: Der Pfad entscheidet. Navigation
// laeuft wie bisher ueber gewoehnliche Links (Vollseitenwechsel) - robust
// auch auf aelteren Tablet-Browsern.
export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return path.startsWith("/settings") ? <SettingsPage /> : <DisplayPage />;
}
