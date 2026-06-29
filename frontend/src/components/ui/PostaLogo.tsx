interface PostaLogoProps {
  /** En superficies oscuras usa trazo claro; en papel usa tinta oscura */
  variant?: 'dark' | 'paper';
  size?: number;
  showWordmark?: boolean;
  /** Solo ícono, sin texto — útil en header móvil */
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
  const bg = variant === 'paper' ? '#D8401E' : '#E8431F';
  const letter = '#F6F0E4';
  const iconSize = iconOnly ? size : size;

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`} aria-label="Posta">
      <svg
        viewBox="0 0 64 64"
        width={iconSize}
        height={iconSize}
        className="shrink-0"
        aria-hidden="true"
      >
        <rect x="8" y="8" width="48" height="48" rx="12" fill={bg} />
        <path
          d="M22 20h12a10 10 0 0 1 0 20h-6v14"
          fill="none"
          stroke={letter}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && !iconOnly && (
        <span
          className="font-display font-bold tracking-[-0.03em] text-[var(--color-text)] truncate"
          style={{ fontSize: Math.max(14, size * 0.5) }}
        >
          Posta
        </span>
      )}
    </div>
  );
}
