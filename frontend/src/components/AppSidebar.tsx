/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LayoutDashboard,
  Package,
  Map,
  Users,
  Route,
  BarChart3,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';
import { ui } from '../styles/ui.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import DeliveryIllustration from './DeliveryIllustration.tsx';

export type SidebarAction =
  | 'dashboard'
  | 'orders'
  | 'map'
  | 'repartidores'
  | 'settings'
  | 'coming-soon';

interface AppSidebarProps {
  activeTab: 'dashboard' | 'notifications' | 'settings';
  showSettings: boolean;
  onNavigate: (action: SidebarAction) => void;
}

interface NavItem {
  id: SidebarAction;
  label: string;
  icon: typeof LayoutDashboard;
  requiresSettings?: boolean;
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', icon: Package },
  { id: 'map', label: 'Mapa en tiempo real', icon: Map },
  { id: 'repartidores', label: 'Repartidores', icon: Users, requiresSettings: true },
  { id: 'coming-soon', label: 'Rutas', icon: Route, comingSoon: true },
  { id: 'coming-soon', label: 'Reportes', icon: BarChart3, comingSoon: true },
  { id: 'settings', label: 'Configuración', icon: Settings, requiresSettings: true },
];

function isItemActive(item: NavItem, activeTab: AppSidebarProps['activeTab']): boolean {
  if (item.comingSoon) return false;
  if (item.id === 'settings') return activeTab === 'settings';
  if (item.id === 'repartidores') return activeTab === 'settings';
  return activeTab === 'dashboard';
}

export default function AppSidebar({ activeTab, showSettings, onNavigate }: AppSidebarProps) {
  const { isDark, toggleTheme } = useTheme();
  const visibleItems = NAV_ITEMS.filter((item) => !item.requiresSettings || showSettings);

  return (
    <aside className={ui.sidebar}>
      <div className={ui.sidebarBrand}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shadow-md shadow-purple-200">
          <span className="text-sm font-bold text-white">LP</span>
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--lupo-text)]">LupoEnvios</p>
          <p className="text-[10px] text-[var(--lupo-text-muted)]">v2.4</p>
        </div>
      </div>

      <nav className={ui.sidebarNav}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item, activeTab);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.comingSoon ? 'coming-soon' : item.id)}
              className={active ? ui.sidebarItemActive : ui.sidebarItem}
              title={item.comingSoon ? 'Próximamente' : item.label}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className={ui.sidebarPromo}>
        <DeliveryIllustration className={ui.sidebarIllustration} />
        <p className="text-xs font-semibold text-[var(--lupo-text)]">Lupo Inteligente</p>
        <p className="text-[10px] text-[var(--lupo-text-muted)] mt-0.5 leading-snug">
          Optimización de rutas con IA — próximamente.
        </p>
      </div>

      <div className={ui.themeToggle}>
        <div className="flex items-center gap-1.5 text-[var(--lupo-text-muted)]">
          {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          <span className="text-[11px] font-medium">Modo oscuro</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label="Alternar modo oscuro"
          onClick={toggleTheme}
          className={`lupo-theme-switch ${isDark ? 'lupo-theme-switch--on' : ''}`}
        >
          <span className="lupo-theme-switch-knob" />
        </button>
      </div>
    </aside>
  );
}
