type Props<T extends string | number> = {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  className?: string;
};

export function Segment<T extends string | number>({ options, value, onChange, className }: Props<T>) {
  return (
    <div className={`segment ${className ?? ""}`}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
