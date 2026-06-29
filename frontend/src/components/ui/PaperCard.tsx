import type { ComponentProps, ReactNode } from 'react';

type PaperCardProps = ComponentProps<'div'> & {
  children?: ReactNode;
};

/** Tarjeta estilo comprobante — solo en contenedor .theme-paper / data-theme="paper" */
export default function PaperCard({ children, className = '', ...props }: PaperCardProps) {
  return (
    <div className={`paper-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
