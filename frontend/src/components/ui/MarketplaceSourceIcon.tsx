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
 * Logo de origen del pedido (Tienda Nube / Mercado Libre / Shopify / WooCommerce).
 * TN y Woo van sobre fondo claro para verse en tema oscuro.
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
      <img
        src="/shopify-logo.svg"
        alt="Shopify"
        title="Shopify"
        className={
          className ??
          `${SIZE[size]} object-contain bg-white rounded-[3px] p-[1px] shrink-0`
        }
      />
    );
  }

  if (source === 'foto') {
    return (
      <span
        title="Etiqueta foto"
        className={
          className ??
          `${SIZE[size]} inline-flex items-center justify-center rounded-[3px] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] text-[9px] shrink-0`
        }
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8h3l2-2h6l2 2h3v11H4V8z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      </span>
    );
  }

  if (source === 'woocommerce') {
    return (
      <img
        src="/woocommerce-logo.svg"
        alt="WooCommerce"
        title="WooCommerce"
        className={
          className ??
          `${SIZE[size]} object-contain rounded-[3px] shrink-0`
        }
      />
    );
  }

  return null;
}
