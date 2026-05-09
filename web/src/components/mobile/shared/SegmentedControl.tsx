export type SegmentedControlOption<TValue extends string> = {
  value: TValue;
  label: string;
};

export function SegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: [SegmentedControlOption<TValue>, SegmentedControlOption<TValue>];
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="mobile-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "mobile-segmented-control-item mobile-segmented-control-item-active" : "mobile-segmented-control-item"}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
