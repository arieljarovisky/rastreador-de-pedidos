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

const BADGE_SIZE = {
  sm: 'h-3.5 min-w-3.5 text-[7px] px-[2px]',
  md: 'h-4 min-w-4 text-[8px] px-[3px]',
} as const;

/**
 * Logo de origen del pedido (Tienda Nube / Mercado Libre / Shopify / WooCommerce).
 * El PNG de TN es negro: va sobre fondo claro para verse en tema oscuro.
 * Shopify y WooCommerce usan badges de texto (sin assets PNG).
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

  if (source === 'shopify') {
    return (
      <span
        title="Shopify"
        aria-label="Shopify"
        className={
          className ??
          `${BADGE_SIZE[size]} inline-flex items-center justify-center rounded-[3px] bg-[#95BF47] text-white font-bold tracking-wide shrink-0 leading-none`
        }
      >
        SH
      </span>
    );
  }

  if (source === 'woocommerce') {
    return (
      <span
        title="WooCommerce"
        aria-label="WooCommerce"
        className={
          className ??
          `${BADGE_SIZE[size]} inline-flex items-center justify-center rounded-[3px] bg-[#7F54B3] text-white font-bold tracking-wide shrink-0 leading-none`
        }
      >
        WC
      </span>
    );
  }

  return null;
}
