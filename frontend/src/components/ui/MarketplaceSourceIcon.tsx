/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface MarketplaceSourceIconProps {
  source?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

const SIZE = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
} as const;

/**
 * Logo de origen del pedido (Tienda Nube / Mercado Libre).
 * El PNG de TN es negro: va sobre fondo claro para verse en tema oscuro.
 */
export default function MarketplaceSourceIcon({
  source,
  className,
  size = 'sm',
}: MarketplaceSourceIconProps) {
  if (source === 'tiendanube') {
    return (
      <img
        src="/tiendanube-logo.png"
        alt="Tienda Nube"
        title="Tienda Nube"
        className={
          className ??
          `${SIZE[size]} object-contain bg-white rounded-[3px] p-[1px] shrink-0`
        }
      />
    );
  }

  if (source === 'mercadolibre') {
    return (
      <img
        src="/mercadolibre-logo.png"
        alt="Mercado Libre"
        title="Mercado Libre"
        className={className ?? `${SIZE[size]} object-contain rounded-[3px] shrink-0`}
      />
    );
  }

  return null;
}
