export function LoadingOverlay({ elapsed, label, onCancel }: { elapsed: number; label: string; onCancel: () => void }) {
  return (
    <div className="overlay">
      <div className="spinner" />
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ color: "var(--muted)", fontSize: 14 }}>{elapsed}秒</div>
      <button type="button" className="btn small" onClick={onCancel}>キャンセル</button>
    </div>
  );
}
