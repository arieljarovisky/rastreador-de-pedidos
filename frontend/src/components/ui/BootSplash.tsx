import PostaLogo from './PostaLogo.tsx';

interface BootSplashProps {
  message?: string;
}

export default function BootSplash({ message = 'Preparando ruta' }: BootSplashProps) {
  return (
    <div className="boot-splash min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[var(--surface-bg)]">
      <div className="boot-splash__grid pointer-events-none" aria-hidden="true" />
      <div className="boot-splash__glow boot-splash__glow--top" aria-hidden="true" />
      <div className="boot-splash__glow boot-splash__glow--bottom" aria-hidden="true" />

      <div className="boot-splash__content relative z-[2] flex flex-col items-center">
        <div className="boot-splash__logo-card">
          <PostaLogo size={64} showWordmark variant="dark" className="boot-splash__logo" />
        </div>

        <p className="boot-splash__tagline font-mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--color-text-faint)] mt-5">
          Hoja de ruta · CABA y GBA
        </p>

        <div className="boot-splash__track mt-8" aria-hidden="true">
          <div className="boot-splash__bar" />
        </div>

        <p className="boot-splash__status font-mono text-[10px] uppercase tracking-wider font-bold text-[var(--color-text-muted)] mt-4">
          {message}
          <span className="boot-splash__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </div>

      <div className="boot-splash__footer absolute bottom-10 flex flex-col items-center gap-2 z-[2]" aria-hidden="true">
        <span className="w-8 h-0.5 rounded-full bg-[var(--surface-border)] opacity-60" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] font-bold text-[var(--color-text-faint)]">
          Posta Envíos
        </span>
      </div>
    </div>
  );
}
