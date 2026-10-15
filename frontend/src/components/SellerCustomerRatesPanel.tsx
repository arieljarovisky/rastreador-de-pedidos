/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiUrl } from '../api.ts';

interface ZoneRate {
  zoneKey: string;
  zoneName: string;
  customerPrice: number | null;
  postaPrice: number;
}

const ZONE_COLOR: Record<string, string> = {
  zona_caba: '#F9E04B',
  zona_cordon_1: '#6BCB9A',
  zona_cordon_2: '#6BA4E8',
  zona_cordon_3: '#B5E48C',
};

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function draftFromPrice(price: number | null): string {
  return price == null ? '' : String(price);
}

export default function SellerCustomerRatesPanel({ token }: { token: string }) {
  const [zones, setZones] = useState<ZoneRate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const applyZones = useCallback((next: ZoneRate[]) => {
    setZones(next);
    setDrafts(Object.fromEntries(next.map((zone) => [zone.zoneKey, draftFromPrice(zone.customerPrice)])));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(apiUrl('/api/seller/customer-shipping-rates'), { headers });
    const body = (await res.json().catch(() => ({}))) as { error?: string; zones?: ZoneRate[] };
    if (!res.ok) throw new Error(body.error || 'No se pudieron cargar los precios.');
    applyZones(body.zones ?? []);
  }, [applyZones, headers]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessageOk(false);
        setMessage(err instanceof Error ? err.message : 'No se pudieron cargar los precios.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const fillWithPosta = () => {
    setDrafts(Object.fromEntries(zones.map((zone) => [zone.zoneKey, String(zone.postaPrice)])));
    setMessage(null);
  };

  const clearCustom = () => {
    setDrafts(Object.fromEntries(zones.map((zone) => [zone.zoneKey, ''])));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = zones.map((zone) => {
        const raw = (drafts[zone.zoneKey] ?? '').trim();
        return {
          zoneKey: zone.zoneKey,
          customerPrice: raw === '' ? null : raw.replace(',', '.'),
        };
      });
      const res = await fetch(apiUrl('/api/seller/customer-shipping-rates'), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ zones: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; zones?: ZoneRate[] };
      if (!res.ok) throw new Error(body.error || 'No se pudieron guardar los precios.');
      applyZones(body.zones ?? []);
      setMessageOk(true);
      setMessage('Precios guardados. Tus clientes los van a ver en Tienda Nube.');
    } catch (err: unknown) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudieron guardar los precios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="paper-card p-3 w-full">
      <div className="flex items-center gap-2 shrink-0 pb-2 mb-2 border-b border-[var(--surface-border)]">
        <div className="w-7 h-7 rounded-[5px] flex items-center justify-center shrink-0 text-sm bg-[var(--color-accent)]/10">
          <span className="leading-none">🏷️</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-display font-semibold text-[var(--color-text)] leading-tight">
            Precios para tus clientes
          </p>
          <p className="mono-label mt-0.5 truncate normal-case tracking-normal">
            Checkout de Tienda Nube · envío Posta
          </p>
        </div>
      </div>

      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
        Elegí cuánto paga tu cliente por el envío Posta en cada zona. Si dejás una zona vacía, ve el
        mismo importe que te cobra Posta. Lo que Posta te factura al entregar no cambia.
      </p>
      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-1">
        En Mercado Libre, Shopify y WooCommerce el precio al cliente se define en cada tienda.
      </p>

      {loading ? (
        <p className="mt-3 text-[11px] text-[var(--color-text-muted)] inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Cargando precios…
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {zones.map((zone) => (
            <label
              key={zone.zoneKey}
              className="bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg px-2.5 py-2"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text)]">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: ZONE_COLOR[zone.zoneKey] ?? '#897c68' }}
                />
                {zone.zoneName}
              </span>
              <span className="block text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Posta te cobra {formatArs(zone.postaPrice)}
              </span>
              <input
                inputMode="decimal"
                value={drafts[zone.zoneKey] ?? ''}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [zone.zoneKey]: e.target.value }))
                }
                placeholder="Igual que Posta"
                className="mt-1.5 w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-2 py-1.5 text-[12px] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving || zones.length === 0}
          className="btn-primary py-2 px-3 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Guardando…' : 'Guardar precios'}
        </button>
        <button
          type="button"
          onClick={fillWithPosta}
          disabled={loading || saving || zones.length === 0}
          className="btn-secondary px-2.5 py-1 disabled:opacity-50"
        >
          Copiar precio de Posta
        </button>
        <button
          type="button"
          onClick={clearCustom}
          disabled={loading || saving || zones.length === 0}
          className="btn-secondary px-2.5 py-1 disabled:opacity-50"
        >
          Seguir el de Posta
        </button>
      </div>

      {message ? (
        <p
          className={`mt-2 text-[11px] leading-relaxed ${
            messageOk ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
