export function ActivityRow({
  title,
  additions,
  deletions,
  age,
  onPress,
}: {
  title: string;
  additions: number;
  deletions: number;
  age: string;
  onPress: () => void;
}) {
  return (
    <button type="button" className="mobile-activity-row" onClick={onPress}>
      <span className="mobile-activity-dot" aria-hidden="true">•</span>
      <span className="mobile-activity-copy">
        <strong>{title}</strong>
        <small>
          <span className="mobile-additions">+{additions}</span>
          {" "}
          <span className="mobile-deletions">-{deletions}</span>
          {" · "}
          {age}
        </small>
      </span>
    </button>
  );
}
