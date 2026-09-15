import { useEffect, useState } from "react";
import { db, saveRating } from "../db/db";
import { Segment } from "./Segment";

const SCORES = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

type Props = { recipeId: number; onClose: () => void };

export function RatingSheet({ recipeId, onClose }: Props) {
  const [taste, setTaste] = useState<number | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void db.ratings.get(recipeId).then((r) => {
      if (!alive) return;
      setTaste(r?.taste_score ?? null);
      setEffort(r?.effort_score ?? null);
      setNote(r?.note ?? "");
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [recipeId]);

  const save = async () => {
    await saveRating(recipeId, { taste_score: taste, effort_score: effort, note: note.trim() });
    onClose();
  };

  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="評価">
        <div className="handle" />
        <h2>味: また食べたい？</h2>
        <Segment className="score" options={SCORES} value={taste} onChange={setTaste} />
        <h2>手間: また作りたい？</h2>
        <Segment className="score" options={SCORES} value={effort} onChange={setEffort} />
        <h2>メモ（任意）</h2>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="次回は塩を控えめに、など" />
        <div className="row">
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>あとで</button>
          <button type="button" className="btn primary" style={{ flex: 2 }} disabled={!loaded || taste === null || effort === null} onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </>
  );
}
