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
      <span className="mobile-activity-copy">
        <strong>{title}</strong>
        <small className="mobile-activity-meta">{age}</small>
      </span>
      <span className="mobile-activity-stats" aria-label={`Diff ${additions} additions, ${deletions} deletions`}>
        {additions > 0 ? (
          <span className="mobile-additions">+{additions}</span>
        ) : null}
        {deletions > 0 ? (
          <span className="mobile-deletions">-{deletions}</span>
        ) : null}
      </span>
    </button>
  );
}
