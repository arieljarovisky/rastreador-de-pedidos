interface PostaLogoProps {
  /** En superficies oscuras usa trazo claro; en papel usa tinta oscura */
  variant?: 'dark' | 'paper';
  size?: number;
  showWordmark?: boolean;
  iconOnly?: boolean;
  className?: string;
}

export default function PostaLogo({
  variant = 'dark',
  size = 32,
  showWordmark = true,
  iconOnly = false,
  className = '',
}: PostaLogoProps) {
  const ink = variant === 'paper' ? '#1A1714' : '#F3F0E8';
  const stamp = variant === 'paper' ? '#E23B16' : '#FF5A2A';

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`} aria-label="Posta">
      <svg viewBox="0 0 64 64" width={size} height={size} className="shrink-0" aria-hidden="true">
        <circle cx="13" cy="32" r="5" fill={ink} />
        <line x1="18" y1="32" x2="28" y2="32" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="33" cy="32" r="6" fill="none" stroke={ink} strokeWidth="3.4" />
        <line x1="39" y1="32" x2="46" y2="32" stroke={stamp} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M45 26 L55 32 L45 38 Z" fill={stamp} />
      </svg>
      {showWordmark && !iconOnly && (
        <span
          className="font-display font-medium tracking-[-0.04em] text-[var(--color-text)] truncate"
          style={{ fontSize: Math.max(14, size * 0.5) }}
        >
          Posta
        </span>
      )}
    </div>
  );
}
