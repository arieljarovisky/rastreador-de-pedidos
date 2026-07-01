/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check } from 'lucide-react';

export interface RegistrationStep {
  id: number;
  label: string;
  title: string;
}

interface RegistrationStepperProps {
  steps: readonly RegistrationStep[];
  currentStep: number;
}

export default function RegistrationStepper({ steps, currentStep }: RegistrationStepperProps) {
  const progressPct =
    steps.length <= 1 ? 100 : ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="mb-4">
      <div className="grid grid-cols-3 w-full gap-2">
        {steps.map((step) => {
          const done = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <div
              key={step.id}
              className="flex flex-col items-center justify-start gap-2 min-w-0 px-0.5 sm:px-1"
            >
              <div
                className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-mono font-bold border-2 transition-all duration-300 ${
                  done
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                    : active
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'border-[var(--surface-border)] text-[var(--color-text-faint)] bg-[var(--surface-panel-2)]'
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span
                className={`w-full text-[9px] sm:text-[10px] font-mono uppercase tracking-wide text-center leading-tight transition-colors duration-300 ${
                  active
                    ? 'text-[var(--color-accent)] font-bold'
                    : done
                      ? 'text-[var(--color-text-muted)]'
                      : 'text-[var(--color-text-faint)]'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 h-1 rounded-full bg-[var(--surface-border)] overflow-hidden mx-1">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] auth-tab-indicator transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <p
        className="mt-3 text-sm font-display font-semibold text-[var(--color-text)] text-center sm:text-left animate-auth-fade-in"
        key={currentStep}
      >
        {steps.find((s) => s.id === currentStep)?.title}
      </p>
    </div>
  );
}
