import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingOverlay } from "../components/Overlay";
import { RecipeCard } from "../components/RecipeCard";
import { useSession } from "../state/session";
import { useSuggest } from "../state/useSuggest";

export function ResultsPage() {
  const s = useSession();
  const nav = useNavigate();
  const { run, loading, elapsed, cancel } = useSuggest();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!s.suggestion) nav("/", { replace: true });
  }, [s.suggestion, nav]);
  if (!s.suggestion) return null;

  const { recipes, engine, model, rawText, savedIds } = s.suggestion;

  const another = async () => {
    setError(null);
    const r = await run({ another: true });
    if (!r.ok) setError(r.message);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="page with-cta">
      <div className="page-header"><h1>提案</h1></div>
      {rawText !== undefined && (
        <>
          <div className="error">JSON として読み取れなかったので、そのまま表示します</div>
          <div className="raw">{rawText}</div>
        </>
      )}
      {recipes.map((r, i) => (
        <RecipeCard
          key={i}
          recipe={r}
          to={`/results/${i}`}
          extra={savedIds[i] !== undefined ? <span className="badge warn">保存済み</span> : undefined}
        />
      ))}
      <div className="hint">{engine} / {model}</div>
      {error && <div className="error">{error}</div>}
      <div className="cta-wrap">
        <button type="button" className="btn primary" disabled={loading} onClick={() => void another()}>別の案を出す</button>
      </div>
      {loading && <LoadingOverlay elapsed={elapsed} label="別の案を考えています" onCancel={cancel} />}
    </div>
  );
}
