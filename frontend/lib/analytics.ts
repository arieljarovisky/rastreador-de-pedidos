type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: GtagFn;
  }
}

const MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || 'G-53NS1Z2TH1';

export function isAnalyticsEnabled() {
  return /^G-[A-Z0-9]+$/.test(MEASUREMENT_ID);
}

export function initAnalytics() {
  if (!isAnalyticsEnabled() || typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement('script');
  script.id = 'ga-gtag';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean | undefined>,
) {
  if (!isAnalyticsEnabled() || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}
