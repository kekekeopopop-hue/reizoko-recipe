import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { TabBar } from "./components/TabBar";
import { ensureSeeded } from "./db/db";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SavedPage } from "./pages/SavedPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SuggestPage } from "./pages/SuggestPage";
import { SessionProvider } from "./state/session";

function Shell() {
  const { pathname } = useLocation();
  const showTabs = ["/", "/results", "/saved", "/settings"].includes(pathname);
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<SuggestPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/results/:index" element={<RecipeDetailPage source="suggestion" />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage source="saved" />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      {showTabs && <TabBar />}
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    ensureSeeded().then(() => setReady(true), (e) => setErr(String(e)));
  }, []);
  if (err) return <div className="page error">データベースを開けませんでした: {err}</div>;
  if (!ready) return null;
  return (
    <SessionProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </SessionProvider>
  );
}
