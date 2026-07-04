/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import PostaLogo from '../ui/PostaLogo.tsx';
import PostaButton from '../ui/PostaButton.tsx';
import PaperCard from '../ui/PaperCard.tsx';
import RegistrationStepper from './RegistrationStepper.tsx';
import SellerBusinessStep, { sellerBusinessStepValid } from './SellerBusinessStep.tsx';
import { apiUrl } from '../../api.js';
import type { MarketplaceAgency, SellerMonthlyOrders, User } from '../../types.js';

const ONBOARDING_STEPS = ['Tu operación', 'Agencia de logística'];

interface SellerOnboardingScreenProps {
  token: string;
  userName: string;
  marketplaceAgencies: MarketplaceAgency[];
  agenciesLoading: boolean;
  onComplete: (user: User) => void;
  onSelectAgency: (agencyId: string | null) => Promise<void>;
}

export default function SellerOnboardingScreen({
  token,
  userName,
  marketplaceAgencies,
  agenciesLoading,
  onComplete,
  onSelectAgency,
}: SellerOnboardingScreenProps) {
  const [step, setStep] = useState(1);
  const [monthlyOrders, setMonthlyOrders] = useState<SellerMonthlyOrders | ''>('');
  const [sellerCategories, setSellerCategories] = useState<string[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/accounts/seller/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ monthlyOrders, sellerCategories }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo guardar tu perfil.');
      }
      const user = (await res.json()) as User;
      if (selectedAgencyId) {
        await onSelectAgency(selectedAgencyId);
        const meRes = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          onComplete(await meRes.json());
          return;
        }
      }
      onComplete(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar el perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrimary = async () => {
    if (step === 1) {
      if (!sellerBusinessStepValid(monthlyOrders, sellerCategories)) return;
      setStep(2);
      return;
    }
    await saveProfile();
  };

  const handleSkipAgency = async () => {
    setSelectedAgencyId(null);
    await saveProfile();
  };

  return (
    <div className="app-viewport safe-top safe-bottom min-h-[100dvh] bg-[var(--surface-bg)] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <PostaLogo variant="paper" size={40} />
          <div>
            <p className="mono-label text-[var(--color-accent)]">Bienvenido/a, {userName}</p>
            <h1 className="font-display text-xl font-semibold text-[var(--color-text)] tracking-[-0.02em]">
              Completá tu perfil de vendedor
            </h1>
          </div>
        </div>

        <PaperCard className="p-5 sm:p-8 border border-[var(--surface-border)] shadow-lg">
          <RegistrationStepper steps={ONBOARDING_STEPS} currentStep={step} />

          {error && (
            <div className="mb-4 text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg p-3">
              {error}
            </div>
          )}

          {step === 1 ? (
            <SellerBusinessStep
              monthlyOrders={monthlyOrders}
              categories={sellerCategories}
              onMonthlyOrdersChange={setMonthlyOrders}
              onCategoriesChange={setSellerCategories}
              disabled={loading}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed flex items-start gap-2">
                <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-accent)]" />
                Elegí la agencia que despachará tus envíos. Podés cambiarla después desde Configuración o el catálogo de agencias.
              </p>
              {agenciesLoading ? (
                <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Cargando agencias…</p>
              ) : marketplaceAgencies.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
                  Todavía no hay agencias publicadas. Podés continuar y elegir una más tarde.
                </p>
              ) : (
                <div className="space-y-2 max-h-[min(24rem,50vh)] overflow-y-auto pr-1">
                  {marketplaceAgencies.map((agency) => {
                    const selected = selectedAgencyId === agency.id;
                    const location = [agency.city, agency.province].filter(Boolean).join(', ');
                    return (
                      <button
                        key={agency.id}
                        type="button"
                        disabled={loading}
                        onClick={() => setSelectedAgencyId(selected ? null : agency.id)}
                        className={`w-full text-left rounded-lg border px-4 py-3 transition ${
                          selected
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/30'
                            : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] hover:border-[var(--color-accent)]/40'
                        }`}
                      >
                        <p className="font-semibold text-sm text-[var(--color-text)]">{agency.name}</p>
                        {location ? (
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{location}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-[var(--surface-border)] flex flex-col-reverse sm:flex-row gap-2">
            {step > 1 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => setStep(1)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg border border-[var(--surface-border)] text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                <ChevronLeft className="w-4 h-4" />
                Atrás
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSkipAgency()}
                className="flex-1 sm:flex-none px-4 py-3 rounded-lg border border-dashed border-[var(--surface-border)] text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Omitir por ahora
              </button>
            )}
            <PostaButton
              type="button"
              disabled={loading || (step === 1 && !sellerBusinessStepValid(monthlyOrders, sellerCategories))}
              onClick={() => void handlePrimary()}
              className="w-full sm:flex-1 py-3 inline-flex items-center justify-center gap-1.5"
            >
              {loading ? 'Guardando…' : step === 1 ? 'Continuar' : 'Finalizar'}
              {!loading && step === 1 && <ChevronRight className="w-4 h-4" />}
              {!loading && step === 2 && <Sparkles className="w-4 h-4" />}
            </PostaButton>
          </div>
        </PaperCard>
      </div>
    </div>
  );
}
