import { Sun, Moon } from 'lucide-react';
import type { PostaTheme } from '../../theme/usePostaTheme.ts';

interface ThemeToggleProps {
  theme: PostaTheme;
  onToggle: () => void;
  className?: string;
  compact?: boolean;
}

export default function ThemeToggle({ theme, onToggle, className = '', compact = false }: ThemeToggleProps) {
  const isLight = theme === 'paper';

  return (
    <button
      type="button"
      onClick={onToggle}
      title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label={isLight ? 'Modo oscuro' : 'Modo claro'}
      className={`inline-flex items-center justify-center rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition ${
        compact ? 'p-1.5' : 'gap-1.5 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide'
      } ${className}`}
    >
      {isLight ? (
        <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden />
      ) : (
        <Sun className="w-3.5 h-3.5 shrink-0" aria-hidden />
      )}
      {!compact && (isLight ? 'Oscuro' : 'Claro')}
    </button>
  );
}
