import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { HaloButton } from '@/components/ui/halo-button';
import { HaloCard } from '@/components/ui/halo-card';
import { HaloInput } from '@/components/ui/halo-input';
import { trackEvent } from '@/lib/analytics';

const DEMO_API = 'https://envios-erp.up.railway.app/api/public/demo';

type Slot = { start: string; label: string };

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function isWeekend(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
}

function formatDisplayDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function DemoBooking() {
  const minDate = useMemo(() => shiftDays(1), []);
  const maxDate = useMemo(() => shiftDays(14), []);
  const minParts = minDate.split('-').map(Number);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [viewYear, setViewYear] = useState(minParts[0]);
  const [viewMonth, setViewMonth] = useState(minParts[1]);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsNote, setSlotsNote] = useState('Elegí una fecha para ver horarios');
  const [start, setStart] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ label: string; meetLink?: string; htmlLink?: string } | null>(null);

  useEffect(() => {
    fetch(`${DEMO_API}/status`)
      .then((res) => res.json())
      .then((data) => setAvailable(Boolean(data.configured)))
      .catch(() => setAvailable(false));
  }, []);

  function bookable(iso: string) {
    return Boolean(iso) && iso >= minDate && iso <= maxDate && !isWeekend(iso);
  }

  function monthHasDays(year: number, month: number) {
    const days = new Date(year, month, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      if (bookable(toIso(year, month, day))) return true;
    }
    return false;
  }

  async function loadSlots(iso: string) {
    setStart(null);
    setSlots([]);
    setSlotsNote('Cargando…');
    try {
      const res = await fetch(`${DEMO_API}/slots?date=${encodeURIComponent(iso)}`);
      const data = await res.json();
      if (!res.ok) {
        setSlotsNote(data.message || 'No pudimos cargar los horarios');
        return;
      }
      const next = (data.slots || []) as Slot[];
      setSlots(next);
      setSlotsNote(next.length ? `${next.length} disponible${next.length === 1 ? '' : 's'}` : 'Sin horarios ese día');
    } catch {
      setSlotsNote('Error de conexión');
    }
  }

  function selectDate(iso: string) {
    if (!bookable(iso)) return;
    setDate(iso);
    setStatus('');
    void loadSlots(iso);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!date) {
      setStatus('Elegí una fecha.');
      setStatusError(true);
      return;
    }
    if (!start) {
      setStatus('Elegí un horario.');
      setStatusError(true);
      return;
    }
    setSubmitting(true);
    setStatus('Agendando…');
    setStatusError(false);
    try {
      const res = await fetch(`${DEMO_API}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          start,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || 'No pudimos agendar.');
        setStatusError(true);
        setSubmitting(false);
        if (data.error === 'SLOT_UNAVAILABLE') void loadSlots(date);
        return;
      }
      setSuccess({ label: data.label, meetLink: data.meetLink, htmlLink: data.htmlLink });
      trackEvent('generate_lead', { method: 'demo' });
    } catch {
      setStatus('Error de conexión.');
      setStatusError(true);
      setSubmitting(false);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const startOffset = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7;
  const cells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
  const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;
  const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
  const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
  const title = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <HaloCard aria-label="Agendar demo" className="mx-auto max-w-5xl" padding="lg" translucent={false} interactive={false}>
      {available === false && (
        <p className="text-sm text-muted-foreground">
          El agendado online todavía no está activo. Escribinos a{' '}
          <a className="text-ember underline underline-offset-4" href="mailto:contacto@enviosposta.com.ar">
            contacto@enviosposta.com.ar
          </a>
          .
        </p>
      )}

      {available !== false && success && (
        <div className="space-y-3 py-6 text-center">
          <p className="font-serif-display text-5xl italic text-signal">Demo agendada.</p>
          <p className="text-muted-foreground">
            Invitación enviada a <strong className="text-foreground">{email}</strong> · {formatDisplayDate(date)} · {success.label} ART
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {success.meetLink && (
              <a className="underline underline-offset-4" href={success.meetLink} target="_blank" rel="noreferrer">
                Unirse a Meet
              </a>
            )}
            {success.htmlLink && (
              <a className="underline underline-offset-4" href={success.htmlLink} target="_blank" rel="noreferrer">
                Google Calendar
              </a>
            )}
          </div>
        </div>
      )}

      {available !== false && !success && (
        <form className="grid gap-8 lg:grid-cols-[280px_1fr]" onSubmit={onSubmit}>
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                className="size-8 rounded-full border border-border text-lg disabled:opacity-30"
                aria-label="Mes anterior"
                disabled={!monthHasDays(prevYear, prevMonth)}
                onClick={() => {
                  setViewYear(prevYear);
                  setViewMonth(prevMonth);
                }}
              >
                ‹
              </button>
              <p className="text-sm capitalize">{title}</p>
              <button
                type="button"
                className="size-8 rounded-full border border-border text-lg disabled:opacity-30"
                aria-label="Mes siguiente"
                disabled={!monthHasDays(nextYear, nextMonth)}
                onClick={() => {
                  setViewYear(nextYear);
                  setViewMonth(nextMonth);
                }}
              >
                ›
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Elegir fecha">
              {Array.from({ length: cells }, (_, index) => {
                const day = index - startOffset + 1;
                if (day < 1 || day > daysInMonth) return <span key={`e-${index}`} />;
                const iso = toIso(viewYear, viewMonth, day);
                const ok = bookable(iso);
                const selected = date === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    disabled={!ok}
                    onClick={() => selectDate(iso)}
                    className={`h-9 rounded-full text-sm ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : ok
                          ? 'hover:bg-muted'
                          : 'text-muted-foreground/40'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm capitalize text-muted-foreground">
              {date ? formatDisplayDate(date) : 'Elegí un día hábil'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Nombre
                <HaloInput translucent={false} required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
              </label>
              <label className="space-y-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Email
                <HaloInput translucent={false} required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
              </label>
            </div>
            <label className="block space-y-1.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Empresa
              <HaloInput translucent={false} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Tu agencia o tienda" />
            </label>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Horario</p>
              <div className="flex min-h-12 flex-wrap gap-2">
                {slots.length === 0 && <p className="text-sm text-muted-foreground">{slotsNote}</p>}
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => {
                      setStart(slot.start);
                      setStatus('');
                    }}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      start === slot.start ? 'border-signal bg-signal text-background' : 'border-border'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
              {slots.length > 0 && <p className="mt-2 text-xs text-signal">{slotsNote}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <HaloButton className="quiet-cta" type="submit" disabled={!start || submitting} isLoading={submitting} loadingText="Agendando…">
                Confirmar demo
              </HaloButton>
              {status && <p className={`text-sm ${statusError ? 'text-destructive' : 'text-muted-foreground'}`}>{status}</p>}
            </div>
          </div>
        </form>
      )}
    </HaloCard>
  );
}
