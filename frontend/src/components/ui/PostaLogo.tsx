interface PostaLogoProps {
  /** En superficies oscuras usa trazo claro; en papel usa tinta oscura */
  variant?: 'dark' | 'paper';
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export default function PostaLogo({
  variant = 'dark',
  size = 32,
  showWordmark = true,
  className = '',
}: PostaLogoProps) {
  const ink = variant === 'paper' ? '#1C1814' : '#E9EDF4';
  const stamp = variant === 'paper' ? '#D8401E' : '#E8431F';

  return (
    <div className={`flex items-center gap-2.5 ${className}`} aria-label="Posta">
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle cx="13" cy="32" r="5" fill={ink} />
        <line x1="18" y1="32" x2="28" y2="32" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="33" cy="32" r="6" fill="none" stroke={ink} strokeWidth="3.4" />
        <line x1="39" y1="32" x2="46" y2="32" stroke={stamp} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M45 26 L55 32 L45 38 Z" fill={stamp} />
      </svg>
      {showWordmark && (
        <span
          className="font-display font-bold tracking-[-0.02em] text-[length:inherit]"
          style={{ fontSize: size * 0.55 }}
        >
          Posta
        </span>
      )}
    </div>
  );
}
