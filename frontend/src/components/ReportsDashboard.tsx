import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, Package, Truck, CheckCircle2, XCircle, Calendar, Users, Store, ArrowLeft } from 'lucide-react';
import { apiUrl } from '../api.js';

interface ReportsSummary {
  total: number;
  pending: number;
  assigned: number;
  delivering: number;
  delivered: number;
  cancelled: number;
}

interface DailyData {
  date: string;
  total: number;
  delivered: number;
  cancelled: number;
}

interface RepartidorData {
  repartidorId: string;
  repartidorName: string;
  total: number;
  delivered: number;
}

interface SellerData {
  sellerId: string | null;
  sellerName: string;
  total: number;
  delivered: number;
}

interface ReportsData {
  summary: ReportsSummary;
  daily: DailyData[];
  byRepartidor: RepartidorData[];
  bySeller: SellerData[];
}

interface ReportsDashboardProps {
  token: string;
  onBack: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function BarChartSimple({ data, maxValue, colorClass }: { data: { label: string; value: number }[]; maxValue: number; colorClass: string }) {
  if (data.length === 0) return <p className="text-xs text-[var(--color-text-muted)] italic">Sin datos</p>;
  return (
    <div className="space-y-1.5">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)] w-16 truncate text-right font-mono">{item.label}</span>
          <div className="flex-1 h-5 bg-[var(--surface-panel-2)] rounded overflow-hidden">
            <div
              className={`h-full ${colorClass} rounded transition-all duration-500`}
              style={{ width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-[11px] font-mono font-bold text-[var(--color-text)] w-8 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ values, colors, labels }: { values: number[]; colors: string[]; labels: string[] }) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-36">
        <p className="text-xs text-[var(--color-text-muted)] italic">Sin datos</p>
      </div>
    );
  }

  let cumulative = 0;
  const segments = values.map((v, i) => {
    const start = cumulative;
    const pct = (v / total) * 100;
    cumulative += pct;
    return { start, pct, color: colors[i] };
  });

  const gradientParts = segments
    .map((s) => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-28 h-28 rounded-full shrink-0"
        style={{
          background: `conic-gradient(${gradientParts})`,
          maskImage: 'radial-gradient(transparent 40%, black 41%)',
          WebkitMaskImage: 'radial-gradient(transparent 40%, black 41%)',
        }}
      />
      <div className="space-y-1">
        {labels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors[i] }} />
            <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
            <span className="text-[11px] font-mono font-bold text-[var(--color-text)]">{values[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsDashboard({ token, onBack }: ReportsDashboardProps) {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const query = params.toString();
      const res = await fetch(apiUrl(`/api/reports/orders${query ? `?${query}` : ''}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'No se pudieron cargar los reportes');
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const summary = data?.summary;
  const deliveryRate = summary && summary.total > 0
    ? Math.round((summary.delivered / summary.total) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/50">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-[var(--radius-posta)] hover:bg-[var(--surface-panel-2)] transition text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BarChart3 className="w-4 h-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)]">Reportes de Pedidos</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-[11px] px-2 py-1 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text)] font-mono"
              title="Desde"
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-[11px] px-2 py-1 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text)] font-mono"
              title="Hasta"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}

        {error && (
          <div className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg p-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <SummaryCard icon={Package} label="Total" value={summary!.total} color="var(--color-text)" />
              <SummaryCard icon={Package} label="Pendientes" value={summary!.pending} color="var(--color-accent)" />
              <SummaryCard icon={Truck} label="Asignados" value={summary!.assigned} color="#6366f1" />
              <SummaryCard icon={Truck} label="En viaje" value={summary!.delivering} color="#f59e0b" />
              <SummaryCard icon={CheckCircle2} label="Entregados" value={summary!.delivered} color="var(--color-ok)" />
              <SummaryCard icon={XCircle} label="Cancelados" value={summary!.cancelled} color="var(--color-danger)" />
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-[var(--color-ok)]" />
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">Tasa de entrega</span>
                </div>
                <span className="text-2xl font-bold font-mono text-[var(--color-ok)]">{deliveryRate}%</span>
              </div>
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">Repartidores activos</span>
                </div>
                <span className="text-2xl font-bold font-mono text-[var(--color-accent)]">{data.byRepartidor.length}</span>
              </div>
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-3.5 h-3.5 text-[#6366f1]" />
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">Vendedores</span>
                </div>
                <span className="text-2xl font-bold font-mono text-[#6366f1]">{data.bySeller.length}</span>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Donut chart - status distribution */}
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4">
                <h3 className="text-xs font-bold text-[var(--color-text)] mb-3 uppercase tracking-wide">Distribución por estado</h3>
                <DonutChart
                  values={[summary!.pending, summary!.assigned, summary!.delivering, summary!.delivered, summary!.cancelled]}
                  colors={['#8b5cf6', '#6366f1', '#f59e0b', '#22c55e', '#ef4444']}
                  labels={['Pendientes', 'Asignados', 'En viaje', 'Entregados', 'Cancelados']}
                />
              </div>

              {/* Daily bar chart */}
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4">
                <h3 className="text-xs font-bold text-[var(--color-text)] mb-3 uppercase tracking-wide">Pedidos diarios (últimos 30 días)</h3>
                <BarChartSimple
                  data={[...data.daily].reverse().slice(-14).map((d) => ({ label: formatDate(d.date), value: d.total }))}
                  maxValue={Math.max(...data.daily.map((d) => d.total), 1)}
                  colorClass="bg-[var(--color-accent)]"
                />
              </div>
            </div>

            {/* Tables Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By Repartidor */}
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4">
                <h3 className="text-xs font-bold text-[var(--color-text)] mb-3 uppercase tracking-wide flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5" /> Rendimiento por repartidor
                </h3>
                {data.byRepartidor.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)] italic">Sin datos de repartidores</p>
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-1 text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono pb-1 border-b border-[var(--surface-border)]">
                      <span>Nombre</span>
                      <span className="text-right">Total</span>
                      <span className="text-right">Entreg.</span>
                      <span className="text-right">%</span>
                    </div>
                    {data.byRepartidor.map((r) => (
                      <div key={r.repartidorId} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-1 text-[11px] py-0.5">
                        <span className="truncate text-[var(--color-text)]">{r.repartidorName}</span>
                        <span className="text-right font-mono text-[var(--color-text-muted)]">{r.total}</span>
                        <span className="text-right font-mono text-[var(--color-ok)]">{r.delivered}</span>
                        <span className="text-right font-mono font-bold text-[var(--color-text)]">
                          {r.total > 0 ? Math.round((r.delivered / r.total) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By Seller */}
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4">
                <h3 className="text-xs font-bold text-[var(--color-text)] mb-3 uppercase tracking-wide flex items-center gap-2">
                  <Store className="w-3.5 h-3.5" /> Pedidos por vendedor
                </h3>
                {data.bySeller.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)] italic">Sin datos de vendedores</p>
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-1 text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-mono pb-1 border-b border-[var(--surface-border)]">
                      <span>Nombre</span>
                      <span className="text-right">Total</span>
                      <span className="text-right">Entreg.</span>
                      <span className="text-right">%</span>
                    </div>
                    {data.bySeller.map((s, i) => (
                      <div key={s.sellerId || i} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-1 text-[11px] py-0.5">
                        <span className="truncate text-[var(--color-text)]">{s.sellerName}</span>
                        <span className="text-right font-mono text-[var(--color-text-muted)]">{s.total}</span>
                        <span className="text-right font-mono text-[var(--color-ok)]">{s.delivered}</span>
                        <span className="text-right font-mono font-bold text-[var(--color-text)]">
                          {s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-2.5 flex flex-col items-center gap-1">
      <Icon className="w-4 h-4" style={{ color }} />
      <span className="text-lg font-mono font-bold" style={{ color }}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">{label}</span>
    </div>
  );
}
