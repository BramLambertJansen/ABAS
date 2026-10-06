/** Decoratief zoekicoon; label en interactie horen bij het veld. */
export function ZoekIcoon({ className = "" }: { className?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true" className={`pointer-events-none text-muted-light ${className}`}>
      <circle cx="7.2" cy="7.2" r="5" stroke="currentColor" strokeWidth="1.7" />
      <line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
