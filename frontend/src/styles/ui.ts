/**
 * Clases de diseño compartidas — LupoEnvios Design System
 */

export const ui = {
  shell: 'lupo-shell',
  content: 'lupo-content',
  header: 'lupo-header',
  footer: 'lupo-footer',
  main: 'lupo-main',

  sidebar: 'lupo-sidebar',
  sidebarBrand: 'lupo-sidebar-brand',
  sidebarNav: 'lupo-sidebar-nav',
  sidebarItem: 'lupo-sidebar-item',
  sidebarItemActive: 'lupo-sidebar-item lupo-sidebar-item--active',
  sidebarPromo: 'lupo-sidebar-promo',

  navTab: 'lupo-nav-tab',
  navTabActive: 'lupo-nav-tab lupo-nav-tab--active',
  navTabPurple: 'lupo-nav-tab lupo-nav-tab--purple',
  navTabNeutral: 'lupo-nav-tab lupo-nav-tab--neutral',

  headerNavBtn: 'lupo-header-nav-btn',
  headerNavBtnActive: 'lupo-header-nav-btn lupo-header-nav-btn--active',
  headerNavBtnPurple: 'lupo-header-nav-btn lupo-header-nav-btn--purple',

  panel: 'lupo-panel',
  panelFlush: 'lupo-panel lupo-panel--flush',

  card: 'lupo-card',
  cardInteractive: 'lupo-card lupo-card--interactive',
  cardSelected: 'lupo-card lupo-card--interactive lupo-card--selected',

  section: 'lupo-section',
  sectionIndigo: 'lupo-section lupo-section--indigo',
  sectionPurple: 'lupo-section lupo-section--purple',
  sectionSky: 'lupo-section lupo-section--sky',
  sectionEmerald: 'lupo-section lupo-section--emerald',

  stat: 'lupo-stat',
  statWarning: 'lupo-stat lupo-stat--warning',
  statSuccess: 'lupo-stat lupo-stat--success',
  statCard: 'lupo-stat-card',
  statIconPurple: 'lupo-stat-icon lupo-stat-icon--purple',
  statIconAmber: 'lupo-stat-icon lupo-stat-icon--amber',
  statIconBlue: 'lupo-stat-icon lupo-stat-icon--blue',
  statIconGreen: 'lupo-stat-icon lupo-stat-icon--green',

  welcome: 'lupo-welcome',
  welcomeTitle: 'lupo-welcome-title',
  welcomeSubtitle: 'lupo-welcome-subtitle',
  ctaBanner: 'lupo-cta-banner',
  emptyState: 'lupo-empty-state',
  emptyIcon: 'lupo-empty-icon',
  segmentGroup: 'lupo-segment-group',
  metricSparkline: 'lupo-metric-sparkline',

  input: 'lupo-input',
  label: 'lupo-label',
  hint: 'lupo-hint',
  hintBox: 'lupo-hint-box',

  btnPrimary: 'lupo-btn lupo-btn--primary',
  btnSecondary: 'lupo-btn lupo-btn--secondary',
  btnGhost: 'lupo-btn lupo-btn--ghost',
  btnDanger: 'lupo-btn lupo-btn--danger',
  btnSm: 'lupo-btn lupo-btn--sm',

  badge: 'lupo-badge',
  badgePending: 'lupo-badge lupo-badge--pending',
  badgeAssigned: 'lupo-badge lupo-badge--assigned',
  badgeDelivering: 'lupo-badge lupo-badge--delivering',
  badgeDelivered: 'lupo-badge lupo-badge--delivered',
  badgeCancelled: 'lupo-badge lupo-badge--cancelled',

  metricLabel: 'lupo-metric-label',
  metricValue: 'lupo-metric-value',
  metricValueSuccess: 'lupo-metric-value lupo-metric-value--success',
  metricValueAccent: 'lupo-metric-value lupo-metric-value--accent',

  pageTitle: 'lupo-page-title',
  pageSubtitle: 'lupo-page-subtitle',

  segment: 'lupo-segment',
  segmentActive: 'lupo-segment lupo-segment--active',

  loginCard: 'lupo-login-card',
  loadingScreen: 'lupo-loading-screen',

  contextMenu: 'lupo-context-menu',
  contextMenuItem: 'lupo-context-menu-item',
  contextMenuItemDanger: 'lupo-context-menu-item lupo-context-menu-item--danger',

  modalBackdrop: 'lupo-modal-backdrop',
  modal: 'lupo-modal',
  modalFooter: 'lupo-modal-footer',

  themeToggle: 'lupo-theme-toggle',
  sidebarIllustration: 'lupo-sidebar-illustration',
  mapControls: 'lupo-map-controls',
  mapControlBtn: 'lupo-map-control-btn',
  mapLiveBadge: 'lupo-map-live-badge',
} as const;

export function orderBadgeClass(status: string): string {
  switch (status) {
    case 'assigned':
      return ui.badgeAssigned;
    case 'delivering':
      return ui.badgeDelivering;
    case 'delivered':
      return ui.badgeDelivered;
    case 'cancelled':
      return ui.badgeCancelled;
    default:
      return ui.badgePending;
  }
}
