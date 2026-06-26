/**
 * Ilustración decorativa — repartidor en moto (estilo mockup LupoEnvios)
 * @license SPDX-License-Identifier: Apache-2.0
 */

export default function DeliveryIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <ellipse cx="60" cy="72" rx="38" ry="4" fill="#7c3aed" fillOpacity="0.12" />
      <circle cx="28" cy="58" r="10" fill="#4c1d95" />
      <circle cx="28" cy="58" r="5" fill="#ede9fe" />
      <circle cx="88" cy="58" r="10" fill="#4c1d95" />
      <circle cx="88" cy="58" r="5" fill="#ede9fe" />
      <path
        d="M22 52 Q35 44 52 46 L68 42 Q82 40 92 48 L96 52"
        stroke="#6d28d9"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="48" y="28" width="28" height="18" rx="4" fill="#8b5cf6" />
      <rect x="52" y="32" width="20" height="10" rx="2" fill="#ede9fe" fillOpacity="0.5" />
      <path d="M76 36 L92 44 L90 50 L74 42 Z" fill="#7c3aed" />
      <circle cx="98" cy="38" r="8" fill="#fbbf24" />
      <path d="M98 34 L98 42 M94 38 L102 38" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="38" cy="32" r="9" fill="#fcd34d" />
      <path d="M34 32 Q38 26 42 32" stroke="#92400e" strokeWidth="1.5" fill="none" />
      <rect x="35" y="38" width="10" height="12" rx="3" fill="#7c3aed" />
      <path d="M30 50 L42 50" stroke="#6d28d9" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M55 22 L62 14 L68 22" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
