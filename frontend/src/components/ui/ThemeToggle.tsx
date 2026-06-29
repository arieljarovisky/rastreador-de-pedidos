import { Sun, Moon } from 'lucide-react';
import type { PostaTheme } from '../../theme/usePostaTheme.ts';

interface ThemeToggleProps {
  theme: PostaTheme;
  onToggle: () => void;
  className?: string;
}

export default function ThemeToggle({ theme, onToggle, className = '' }: ThemeToggleProps) {
  const isLight = theme === 'paper';

  return (
    <button
      type="button"
      onClick={onToggle}
      title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label={isLight ? 'Modo oscuro' : 'Modo claro'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] font-mono text-[10px] font-bold uppercase tracking-wide transition ${className}`}
    >
      {isLight ? (
        <>
          <Moon className="w-3 h-3 shrink-0" aria-hidden />
          Oscuro
        </>
      ) : (
        <>
          <Sun className="w-3 h-3 shrink-0" aria-hidden />
          Claro
        </>
      )}
    </button>
  );
}
