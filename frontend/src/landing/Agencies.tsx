import { HaloCard } from '@/components/ui/halo-card';

export const AGENCIES = [
  { id: 'pallares', name: 'Moto Pallares', place: 'Caballito' },
  { id: 'alcorta', name: 'Envíos Alcorta', place: 'Parque Patricios' },
  { id: 'munro', name: 'Pack Munro', place: 'Munro' },
  { id: 'haedo', name: 'Reparto Haedo', place: 'Haedo' },
  { id: 'wilde', name: 'Giro Wilde', place: 'Wilde' },
  { id: 'benedetti', name: 'Benedetti Envíos', place: 'Lanús' },
  { id: 'ferreyra', name: 'Ferreyra Cadetes', place: 'Ramos Mejía' },
  { id: 'cruce', name: 'Cruce Norte', place: 'Vicente López' },
] as const;

const QUOTES = [
  {
    agency: 'Moto Pallares',
    place: 'Caballito',
    name: 'Mariano Pallares',
    role: 'Dueño',
    initials: 'MP',
    body: 'El vendedor mandaba la etiqueta por WhatsApp y a las siete no sabíamos quién había salido. Ahora entra solo y el repartidor lo ve en el celular.',
  },
  {
    agency: 'Benedetti Envíos',
    place: 'Lanús',
    name: 'Diego Benedetti',
    role: 'Operaciones',
    initials: 'DB',
    body: 'Dieciséis motos en zona sur. El mapa nos sacó las llamadas de “¿dónde estás?” que nos comían la tarde. Si se corta el dato, igual siguen.',
  },
  {
    agency: 'Ferreyra Cadetes',
    place: 'Ramos Mejía',
    name: 'Claudia Ferreyra',
    role: 'Administración',
    initials: 'CF',
    body: 'Lo que más nos cerró es que Mercado Libre y Tienda Nube caen en la misma hoja de ruta. Dejamos la planilla de los Flex.',
  },
] as const;

function AgencyMark({ id }: { id: (typeof AGENCIES)[number]['id'] }) {
  switch (id) {
    case 'pallares':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <circle cx="16" cy="20" r="13" fill="none" stroke="#c45c26" strokeWidth="1.8" />
          <circle cx="10.5" cy="24" r="3.2" fill="none" stroke="#c45c26" strokeWidth="1.6" />
          <circle cx="22" cy="24" r="3.2" fill="none" stroke="#c45c26" strokeWidth="1.6" />
          <path d="M8 18h7l3-5h5l-2 5h4" fill="none" stroke="#c45c26" strokeWidth="1.5" strokeLinejoin="round" />
          <text x="36" y="16" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="8" letterSpacing="2.4" fontWeight="600">
            MOTO
          </text>
          <text x="36" y="32" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="15" fontWeight="700" letterSpacing="-0.4">
            Pallares
          </text>
        </svg>
      );
    case 'alcorta':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <text x="2" y="14" fill="currentColor" fontFamily="Georgia, serif" fontSize="8" letterSpacing="3.2" opacity="0.7">
            ENVÍOS
          </text>
          <text x="0" y="33" fill="currentColor" fontFamily="Georgia, 'Times New Roman', serif" fontSize="20" fontStyle="italic">
            Alcorta
          </text>
          <line x1="2" y1="37" x2="92" y2="37" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
        </svg>
      );
    case 'munro':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <rect x="1" y="4" width="86" height="32" rx="6" fill="none" stroke="#3d6b4f" strokeWidth="1.7" />
          <text x="44" y="18" textAnchor="middle" fill="#3d6b4f" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="11" fontWeight="800" letterSpacing="2">
            PACK
          </text>
          <text x="44" y="30" textAnchor="middle" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="9" letterSpacing="1.6">
            MUNRO
          </text>
        </svg>
      );
    case 'haedo':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <text x="0" y="16" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="8" letterSpacing="2.8" fontWeight="500">
            REPARTO
          </text>
          <text x="0" y="34" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="18" fontWeight="700" fontStyle="italic" letterSpacing="-0.6">
            Haedo
          </text>
          <path d="M78 28h22l-5-4m5 4l-5 4" fill="none" stroke="#c45c26" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'wilde':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <circle cx="18" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M18 8.5a11.5 11.5 0 1 1-8 3.2" fill="none" stroke="#c45c26" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M7.5 9.2l2.4 5.2 5-1.6" fill="none" stroke="#c45c26" strokeWidth="1.7" strokeLinejoin="round" />
          <text x="40" y="16" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="9" letterSpacing="2.2" fontWeight="600">
            GIRO
          </text>
          <text x="40" y="32" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="16" fontWeight="700" letterSpacing="1.4">
            WILDE
          </text>
        </svg>
      );
    case 'benedetti':
      return (
        <svg viewBox="0 0 176 40" className="h-9 w-44" aria-hidden="true">
          <path d="M18 4 L32 18 L18 32 L4 18 Z" fill="none" stroke="#8b2942" strokeWidth="1.6" />
          <text x="18" y="22.5" textAnchor="middle" fill="#8b2942" fontFamily="Georgia, serif" fontSize="14" fontWeight="700">
            B
          </text>
          <text x="40" y="17" fill="currentColor" fontFamily="Georgia, serif" fontSize="14">
            Benedetti
          </text>
          <text x="40" y="31" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="8" letterSpacing="2.4" opacity="0.75">
            ENVÍOS · LANÚS
          </text>
        </svg>
      );
    case 'ferreyra':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <ellipse cx="70" cy="20" rx="68" ry="16.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
          <ellipse cx="70" cy="20" rx="63" ry="13" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
          <text x="70" y="17" textAnchor="middle" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1.8">
            FERREYRA
          </text>
          <text x="70" y="28" textAnchor="middle" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="7" letterSpacing="1.6" opacity="0.75">
            CADETES · EST. 2014
          </text>
        </svg>
      );
    case 'cruce':
      return (
        <svg viewBox="0 0 168 40" className="h-9 w-[10.5rem]" aria-hidden="true">
          <path d="M6 28 L18 10 L24 10 L12 28 Z" fill="currentColor" />
          <path d="M16 28 L28 10 L34 10 L22 28 Z" fill="currentColor" opacity="0.42" />
          <text x="42" y="17" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="11" fontWeight="800" letterSpacing="1.2">
            CRUCE
          </text>
          <text x="42" y="31" fill="currentColor" fontFamily="'Geist Variable', system-ui, sans-serif" fontSize="11" fontWeight="600" letterSpacing="2.4" opacity="0.72">
            NORTE
          </text>
        </svg>
      );
    default:
      return null;
  }
}

export function Agencies() {
  return (
    <section id="agencias" className="py-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ember">En la calle</p>
        <h2 className="mt-3 max-w-xl font-serif-display text-5xl italic leading-[0.95] sm:text-6xl">
          Ya despachan con Posta.
        </h2>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Agencias de CABA y GBA que coordinan flota, vendedores y motos sobre la misma hoja de ruta.
        </p>
      </div>

      <div className="agency-marquee mt-10 overflow-hidden border-y border-border py-4" aria-label="Agencias que usan Posta">
        <div className="agency-track flex w-max items-center gap-2 pr-8">
          {AGENCIES.map((agency) => (
            <div
              key={agency.id}
              className="agency-logo flex h-14 min-w-[9.75rem] items-center justify-center px-4 text-foreground/80"
              aria-label={`${agency.name}, ${agency.place}`}
            >
              <AgencyMark id={agency.id} />
            </div>
          ))}
          <div className="flex items-center gap-2" aria-hidden="true">
            {AGENCIES.map((agency) => (
              <div
                key={`dup-${agency.id}`}
                className="agency-logo flex h-14 min-w-[9.75rem] items-center justify-center px-4 text-foreground/80"
              >
                <AgencyMark id={agency.id} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-4 px-5 md:grid-cols-3 lg:px-8">
        {QUOTES.map((quote) => (
          <HaloCard key={quote.agency} aria-label={`Comentario de ${quote.name}`} padding="lg" translucent={false} interactive={false}>
            <p className="text-sm leading-relaxed text-muted-foreground">“{quote.body}”</p>
            <div className="mt-5 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                {quote.initials}
              </span>
              <div>
                <p className="text-sm tracking-tight">{quote.name}</p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {quote.role} · {quote.agency} · {quote.place}
                </p>
              </div>
            </div>
          </HaloCard>
        ))}
      </div>
    </section>
  );
}
