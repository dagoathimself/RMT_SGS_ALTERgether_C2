/** Prominent empty state for a researcher with no active grants. */
export function EmptyShared() {
  return (
    <div className="empty-state" role="status">
      <div className="empty-icon" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24">
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      </div>
      <div>
        <p className="empty-title">Nothing is shared with you right now</p>
        <p className="empty-text">When a participant chooses you by name, their sample appears here, ready to read. Until then, every sample stays sealed.</p>
      </div>
    </div>
  );
}
