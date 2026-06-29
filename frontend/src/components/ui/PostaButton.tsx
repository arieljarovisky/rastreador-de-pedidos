import type { ComponentProps, ReactNode } from 'react';

type PostaButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary';
  children?: ReactNode;
};

export default function PostaButton({
  variant = 'primary',
  className = '',
  children,
  type = 'button',
  ...props
}: PostaButtonProps) {
  const base = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  return (
    <button type={type} className={`${base} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
