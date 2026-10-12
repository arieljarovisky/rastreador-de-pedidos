import { useEffect, useState } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { DirectionAwareTabs } from '@/components/ui/direction-aware-tabs';
import {
  DynamicDescription,
  DynamicIsland,
  DynamicIslandProvider,
  DynamicTitle,
  SIZE_PRESETS,
} from '@/components/ui/dynamic-island';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { HaloBadge } from '@/components/ui/halo-badge';
import { HaloButton } from '@/components/ui/halo-button';
import { HaloCard } from '@/components/ui/halo-card';
import { IPhone17ProMax } from '@/components/ui/apple-iphone-17-pro';
import { NeumorphEyebrow } from '@/components/ui/neumorph-eyebrow';
import { RollingNumber } from '@/components/ui/rolling-number';
import SquigglyArrow from '@/components/ui/squiggle-arrow';
import TextAnimate from '@/components/ui/text-animate';
import { Typewriter } from '@/components/ui/typewriter';
import { DemoBooking } from './DemoBooking.tsx';

const LIVE_STATES = ['pendiente.', 'asignado.', 'en viaje.', 'en la puerta.'];

const APK_FALLBACK =
  'https://expo.dev/artifacts/eas/aIJTY4vilORXfj149rNpf76mMVY-hGPiaJc7CGWx7wI.apk';
const VERSION_API = 'https://envios-erp.up.railway.app/api/app/version';

const NAV = [
  { href: '#porque', label: 'Por qué' },
  { href: '#roles', label: 'Roles' },
  { href: '#recorrido', label: 'Recorrido' },
  { href: '#descargar', label: 'App' },
  { href: '#precios', label: 'Tarifas' },
];

const ZONES = ['Norte', 'Centro', 'Sur', 'Oeste', 'GBA Sur'];

const REASONS = [
  {
    n: '01',
    title: 'Todo pasa en vivo',
    body: 'Cada pedido cambia de estado al toque. Si se corta internet, el sistema sigue con lo último que vio y se pone al día solo.',
  },
  {
    n: '02',
    title: 'La ruta la arma el mapa',
    body: 'Calcula el camino por calles reales hasta la puerta. El repartidor navega con el GPS de siempre, paso a paso.',
  },
  {
    n: '03',
    title: 'Una sola pantalla',
    body: 'Pedidos, motos, zonas y entregas en un lugar. Quién lleva qué, dónde está y cuánto falta, sin llamar a nadie.',
  },
];

const FEATURES = [
  { code: 'F-01', title: 'Estados en vivo', body: 'Pendiente, asignado, en viaje, entregado. Color y posición siempre al día.' },
  { code: 'F-02', title: 'Mapa con rutas', body: 'El camino por calles reales, calculado al instante con OpenStreetMap.' },
  { code: 'F-03', title: 'GPS paso a paso', body: 'El repartidor abre la navegación por voz en Google Maps con un toque.' },
  { code: 'F-04', title: 'Notificaciones', body: 'Avisos de asignación, entrega y novedades, aunque estés en otra pestaña.' },
  { code: 'F-05', title: 'Multizona', body: 'Norte, Centro, Sur, Oeste y GBA Sur. Sugiere el repartidor por dirección.' },
  { code: 'F-06', title: 'Sin tiendas', body: 'Android con APK directo. iPhone como app web desde Safari.' },
];

const STOPS = [
  { n: '01', seal: 'Pendiente', title: 'Entra al sistema', body: 'Se carga a mano o se importa, listo para asignar.' },
  { n: '02', seal: 'Asignado', title: 'Tiene dueño', body: 'La agencia o el repartidor lo toma. Ya sabés quién lo lleva.' },
  { n: '03', seal: 'En viaje', title: 'En la calle', body: 'GPS activo y ruta al destino. Se ve moverse en el mapa.' },
  { n: '04', seal: 'Entregado', title: 'Cierra el ciclo', body: 'El repartidor confirma desde el celular y queda listo.' },
];

const PLANS = [
  { key: 'Flota chica', title: 'Hasta 10', price: '20.000', body: 'Para agencias que arrancan o operan con hasta diez repartidores.', featured: false },
  { key: 'Flota mediana', title: 'Hasta 20', price: '35.000', body: 'Para agencias en crecimiento con hasta veinte repartidores activos.', featured: true },
  { key: 'Flota grande', title: 'Más de 20', price: '50.000', body: 'Para operaciones con más de veinte repartidores en la misma agencia.', featured: false },
];

const PLAN_POINTS = [
  'Mapa y flota en tiempo real',
  'App repartidor con GPS',
  'Mercado Libre, Tienda Nube, Shopify y Woo',
  'Zonas, asignación y estadísticas',
  'Cobrá envíos a vendedores con tu MP',
];

const SHOPS = [
  { name: 'Mercado Libre', sub: 'Flex', mark: 'ML', note: 'Traé los envíos Flex de a uno o en masa. Los webhooks mantienen todo sincronizado.' },
  { name: 'Tienda Nube', sub: 'Express', mark: 'TN', note: 'Sincronizá tus pedidos Express y seguilos dentro de Posta, junto al resto.' },
  { name: 'Shopify', sub: 'Domicilio', mark: 'Sh', note: 'Cada venta con envío a domicilio aparece sola, lista para asignar.' },
  { name: 'WooCommerce', sub: 'Domicilio', mark: 'Woo', note: 'Pegás las claves de tu tienda y los pedidos pagos se importan solos.' },
];

function Logo({ className = '' }: { className?: string }) {
  return (
    <a href="#top" className={`inline-flex items-center gap-2 font-semibold tracking-[-0.04em] ${className}`}>
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="13" cy="32" r="5" fill="currentColor" />
        <line x1="18" y1="32" x2="28" y2="32" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="33" cy="32" r="6" fill="none" stroke="currentColor" strokeWidth="3.4" />
        <line x1="39" y1="32" x2="46" y2="32" stroke="var(--ember)" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M45 26 L55 32 L45 38 Z" fill="var(--ember)" />
      </svg>
      Posta
    </a>
  );
}

function RiderScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f6f1e6] px-4 pb-8 pt-2 text-[#1a1714]">
      <p className="text-[10px] uppercase tracking-[0.22em] text-[#8a7d6b]">Hoja de ruta</p>
      <p className="font-serif-display text-3xl italic leading-none">Lucía Paz</p>
      <p className="mt-1 text-xs text-[#5c5144]">Av. Rivadavia 4100 · en viaje</p>
      <svg viewBox="0 0 220 170" className="mt-3 h-36 w-full" aria-hidden="true">
        <rect width="220" height="170" rx="16" fill="#efe6d4" />
        <path d="M28,150 C70,140 78,70 120,78 C160,86 168,120 196,48" fill="none" stroke="#1a1714" strokeWidth="3" strokeLinecap="round" />
        <circle cx="28" cy="150" r="5" fill="#1a1714" />
        <circle cx="196" cy="48" r="6" fill="#e23b16" />
        <g className="rider-dot">
          <circle r="6" fill="#dff56a" stroke="#1a1714" strokeWidth="2" />
        </g>
      </svg>
      <div className="mt-auto space-y-2 text-xs">
        {[
          ['LP', 'Lucía Paz', 'En viaje'],
          ['DR', 'Diego Ruíz', 'Asignado'],
          ['MG', 'Mario Gómez', 'Entregado'],
        ].map(([ini, who, state]) => (
          <div key={who} className="flex items-center gap-2 rounded-2xl bg-white/70 px-2 py-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-[#1a1714] text-[10px] text-[#f6f1e6]">{ini}</span>
            <span className="flex-1">{who}</span>
            <span className="text-[10px] uppercase tracking-wider text-[#8a7d6b]">{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phone({ className = '' }: { className?: string }) {
  return (
    <IPhone17ProMax
      className={className}
      frameColor="graphite"
      time="14:32"
      batteryLevel={78}
      signalStrength={4}
      dynamicIslandContent={
        <div className="px-2 text-left text-[11px] leading-tight text-white">
          <div className="font-semibold">Lucía Paz</div>
          <div className="opacity-70">En viaje · 6 min</div>
        </div>
      }
    >
      <RiderScreen />
    </IPhone17ProMax>
  );
}

function PlanBody({ plan }: { plan: (typeof PLANS)[number] }) {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{plan.key}</p>
        {plan.featured && <HaloBadge live>Recomendado</HaloBadge>}
      </div>
      <h3 className="font-serif-display text-4xl italic">{plan.title}</h3>
      <p className="text-sm text-muted-foreground">{plan.body}</p>
      <p className="text-3xl tracking-tight">
        ${plan.price}
        <span className="ml-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">por mes · ARS</span>
      </p>
      <ul className="space-y-2 text-sm">
        {PLAN_POINTS.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="text-signal">▸</span>
            {point}
          </li>
        ))}
      </ul>
      <a href="/app" className="mt-auto inline-flex text-sm underline underline-offset-4">
        Probar 14 días gratis
      </a>
    </div>
  );
}

function readDark() {
  return document.documentElement.classList.contains('dark');
}

function DispatchClock() {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('es-AR', { hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="ml-auto hidden font-mono text-[11px] tabular-nums text-muted-foreground lg:inline">{clock}</span>;
}

export function LandingPage() {
  const [dark, setDark] = useState(readDark);
  const [open, setOpen] = useState(false);
  const [apk, setApk] = useState(APK_FALLBACK);
  const [statsOn, setStatsOn] = useState(false);

  useEffect(() => {
    fetch(VERSION_API)
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (info && typeof info.downloadUrl === 'string' && info.downloadUrl) setApk(info.downloadUrl);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const node = document.getElementById('stats');
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStatsOn(true);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('posta-theme', next);
    localStorage.setItem('posta_theme', next === 'dark' ? 'dark' : 'paper');
    setDark(!dark);
  }

  const roleTabs = [
    {
      id: 0,
      label: 'Agencia',
      content: (
        <HaloCard aria-label="Rol agencia" className="mt-6" padding="lg" translucent={false} interactive={false}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ember">Rol 01</p>
          <h3 className="mt-2 font-serif-display text-4xl italic">La torre.</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Asignás repartidores y controlás la flota completa.</li>
            <li>Seguís el mapa en vivo, con todos los pines a la vista.</li>
            <li>Ves las estadísticas y el estado del día al instante.</li>
          </ul>
        </HaloCard>
      ),
    },
    {
      id: 1,
      label: 'Vendedor',
      content: (
        <HaloCard aria-label="Rol vendedor" className="mt-6" padding="lg" translucent={false} interactive={false}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ember">Rol 02</p>
          <h3 className="mt-2 font-serif-display text-4xl italic">La tienda.</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Cargás envíos a mano o los importás de tus tiendas.</li>
            <li>Seguís cada entrega sin tener que llamar a nadie.</li>
            <li>La dirección se geocodifica sola en CABA y GBA.</li>
          </ul>
        </HaloCard>
      ),
    },
    {
      id: 2,
      label: 'Repartidor',
      content: (
        <HaloCard aria-label="Rol repartidor" className="mt-6" padding="lg" translucent={false} interactive={false}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ember">Rol 03</p>
          <h3 className="mt-2 font-serif-display text-4xl italic">La moto.</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Tomás los pedidos disponibles de tu zona.</li>
            <li>Arrancás el viaje con la ruta dibujada en pantalla.</li>
            <li>Confirmás la entrega desde el celular.</li>
            <li>
              <a className="underline underline-offset-4" href="#descargar">
                Instalá la app
              </a>{' '}
              desde el navegador.
            </li>
          </ul>
        </HaloCard>
      ),
    },
  ];

  const downloadTabs = [
    {
      id: 0,
      label: 'Android',
      content: (
        <div className="mt-6 space-y-3 text-sm text-muted-foreground">
          <p className="text-foreground">APK nativo con GPS en segundo plano. Ideal con el celular bloqueado.</p>
          <p>01 · Si Android dice conflicto de paquete, desinstalá la app anterior.</p>
          <p>02 · Tocá Descargar APK y esperá que termine.</p>
          <p>03 · Abrí el archivo y activá Instalar apps desconocidas si lo pide.</p>
          <p>04 · Iniciá sesión y permití ubicación siempre.</p>
        </div>
      ),
    },
    {
      id: 1,
      label: 'iPhone',
      content: (
        <div className="mt-6 space-y-3 text-sm text-muted-foreground">
          <p className="text-foreground">App web en la pantalla de inicio. El GPS en segundo plano es más limitado.</p>
          <p>01 · Tocá Instalar en Safari y entrá con tu usuario.</p>
          <p>02 · Tocá Compartir, el cuadrado con flecha.</p>
          <p>03 · Elegí Agregar a pantalla de inicio.</p>
          <p>04 · Abrí Posta desde el ícono y permití la ubicación.</p>
        </div>
      ),
    },
  ];

  return (
    <div id="top" className="cabina min-h-screen overflow-x-hidden bg-background text-foreground">
      <h1 className="sr-only">Posta — hoja de ruta en vivo para tu logística en CABA y GBA</h1>

      <header className="fixed inset-x-0 top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex flex-1 items-center gap-4 rounded-full border border-border/80 bg-background/70 px-4 py-2 backdrop-blur-xl">
            <Logo />
            <nav className="hidden items-center gap-4 text-xs uppercase tracking-[0.16em] text-muted-foreground md:flex" aria-label="Secciones">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-foreground">
                  {item.label}
                </a>
              ))}
            </nav>
            <DispatchClock />
          </div>
          <a href="/seguimiento" className="hidden text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground sm:inline">
            Seguí tu envío
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
            className="grid size-10 place-items-center rounded-full border border-border bg-background/70 backdrop-blur-xl"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-border md:hidden"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
        {open && (
          <div className="mx-4 rounded-3xl border border-border bg-background p-4 md:hidden">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="block py-2" onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
            <a href="/seguimiento" className="block py-2" onClick={() => setOpen(false)}>
              Seguí tu envío
            </a>
            <a href="/app" className="block py-2" onClick={() => setOpen(false)}>
              Iniciar sesión
            </a>
          </div>
        )}
      </header>

      <section className="relative min-h-[100svh] overflow-hidden pt-28">
        <p className="pointer-events-none absolute top-32 left-3 z-10 hidden origin-left -translate-y-4 -rotate-90 text-[10px] uppercase tracking-[0.45em] text-muted-foreground xl:block">
          Cabina de despacho · Buenos Aires
        </p>

        <div className="relative z-20 mx-auto grid max-w-6xl items-end gap-10 px-5 pb-16 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="max-w-xl pt-10 lg:pt-24">
            <NeumorphEyebrow className="mb-5">CABA → GBA · en el aire</NeumorphEyebrow>
            <HaloBadge live className="mb-6">
              Hoja de ruta abierta
            </HaloBadge>
            <TextAnimate
              text="La calle,"
              type="whipInUp"
              className="m-0 p-0 text-[clamp(4.6rem,12vw,8.6rem)] leading-[0.82] font-medium tracking-[-0.07em] text-foreground"
              style={{ display: 'flex', overflow: 'visible' }}
            />
            <p className="font-serif-display -mt-1 text-[clamp(4.6rem,12vw,8.6rem)] leading-[0.82] tracking-[-0.04em] text-signal italic">
              en vivo.
            </p>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              <Typewriter
                delay={0.4}
                baseText="Ahora mismo está "
                texts={LIVE_STATES}
              />
            </p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Posta sigue cada moto en tiempo real, arma la ruta por GPS y deja a tu agencia, tus tiendas y tus repartidores en la misma página.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <HaloButton className="quiet-cta" render={<a href="/app" />} nativeButton={false}>
                Entrar al panel
              </HaloButton>
              <a href="#demo" className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
                Agendar demo
              </a>
            </div>
            <div className="mt-6 hidden items-end gap-2 text-signal lg:flex">
              <SquigglyArrow width={140} height={64} direction="right" variant="bouncy" className="text-signal" />
              <span className="pb-3 text-[11px] uppercase tracking-[0.2em]">la moto de Lucía</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -top-2 left-6 z-30 h-20 w-[320px]">
              <DynamicIslandProvider initialSize={SIZE_PRESETS.LONG}>
                <DynamicIsland id="posta-live">
                  <div className="flex h-full items-center gap-3 px-4 text-left text-white">
                    <span className="size-2 shrink-0 rounded-full bg-[#dff56a]" />
                    <div>
                      <DynamicTitle className="text-sm font-medium text-white">Lucía Paz · en viaje</DynamicTitle>
                      <DynamicDescription className="text-[11px] text-white/70">Rivadavia 4100 · 6 min</DynamicDescription>
                    </div>
                  </div>
                </DynamicIsland>
              </DynamicIslandProvider>
            </div>
            <div className="mx-auto h-[560px] max-w-[340px] overflow-hidden lg:mr-[-8%] lg:ml-auto lg:origin-top lg:scale-[0.92] lg:-rotate-6">
              <Phone className="!p-0" />
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-y border-border py-3">
        <div className="ticker-track flex w-max gap-8 pr-8 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          {[...ZONES, ...ZONES, ...ZONES, ...ZONES].map((zone, index) => (
            <span key={`${zone}-${index}`}>{zone}</span>
          ))}
        </div>
      </div>

      <div id="stats" className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 sm:grid-cols-4 lg:px-8">
        {[
          [5, 'zonas'],
          [3, 'roles'],
          [4, 'tiendas'],
          [14, 'días de prueba'],
        ].map(([value, label]) => (
          <div key={String(label)}>
            <p className="font-serif-display text-5xl italic text-signal">
              <RollingNumber value={statsOn ? Number(value) : 0} />
            </p>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <section id="porque" className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <GradientHeading size="xl" weight="black" className="max-w-3xl">
          Menos llamadas. Menos planillas. Más entregas.
        </GradientHeading>
        <p className="mt-4 max-w-xl text-muted-foreground">Toda la operación corre sobre la misma información. Vos mirás, no perseguís.</p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {REASONS.map((reason) => (
            <HaloCard key={reason.n} aria-label={reason.title} padding="lg" translucent={false} interactive={false}>
              <p className="font-serif-display text-5xl italic text-ember">{reason.n}</p>
              <h3 className="mt-4 text-xl tracking-tight">{reason.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{reason.body}</p>
            </HaloCard>
          ))}
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ember">Para quién es</p>
        <h2 className="mt-3 max-w-xl font-serif-display text-5xl italic leading-[0.95] sm:text-6xl">Tres roles, una misma calle.</h2>
        <div className="mt-8">
          <DirectionAwareTabs tabs={roleTabs} className="bg-foreground/10" />
        </div>
      </section>

      <section id="recorrido" className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ember">El recorrido</p>
        <h2 className="mt-3 font-serif-display text-5xl italic leading-[0.95] sm:text-6xl">De la carga a la puerta.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {STOPS.map((stop) => (
            <HaloCard key={stop.n} aria-label={stop.title} padding="none" translucent={false} interactive={false}>
              <div className="p-5">
                <p className={`text-[11px] uppercase tracking-[0.18em] ${stop.n === '03' ? 'text-signal' : 'text-muted-foreground'}`}>{stop.seal}</p>
                <h3 className="mt-3 text-lg">{stop.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{stop.body}</p>
              </div>
            </HaloCard>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Si algo sale mal, se cancela o se reporta una incidencia en cualquier punto.</p>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
        <h2 className="font-serif-display text-4xl italic">La caja de herramientas.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <HaloCard key={feature.code} aria-label={feature.title} padding="lg" translucent={false} interactive={false}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ember">{feature.code}</p>
              <h3 className="mt-3 text-lg">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
            </HaloCard>
          ))}
        </div>
      </section>

      <section id="integraciones" className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ember">Integraciones</p>
        <h2 className="mt-3 max-w-2xl font-serif-display text-5xl italic leading-[0.95]">Tu vendedor no te manda más etiquetas por WhatsApp.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {SHOPS.map((shop) => (
            <HaloCard key={shop.name} aria-label={shop.name} padding="lg" translucent={false} interactive={false}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-serif-display text-3xl italic">{shop.mark}</p>
                  <h3 className="mt-2 text-lg">{shop.name}</h3>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{shop.sub}</p>
                </div>
                <HaloBadge live>Conectado</HaloBadge>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{shop.note}</p>
            </HaloCard>
          ))}
        </div>
        <p className="mt-6 text-sm text-ember">Los envíos importados entran como pendiente, sin duplicados, con su ID de referencia.</p>
      </section>

      <section id="descargar" className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-ember">App para repartidores</p>
          <h2 className="mt-3 font-serif-display text-5xl italic leading-[0.95]">Instalá Posta en el celular.</h2>
          <p className="mt-4 text-muted-foreground">Android con APK directo. iPhone como app web desde Safari. Sin App Store ni Play Store.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <HaloButton className="quiet-cta" render={<a href={apk} />} nativeButton={false}>
              Descargar APK
            </HaloButton>
            <a href="/app" className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
              Instalar en Safari
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Android 8+ · iOS 15+ · requiere permiso de ubicación</p>
          <DirectionAwareTabs tabs={downloadTabs} className="mt-8 bg-foreground/10" />
        </div>
        <div className="h-[520px] overflow-hidden">
          <div className="origin-top scale-[0.72]">
            <Phone />
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ember">Demo en vivo</p>
            <h2 className="mt-3 font-serif-display text-5xl italic">30 minutos con Posta</h2>
          </div>
          <p className="text-sm text-muted-foreground">Google Meet · lun–vie · ART</p>
        </div>
        <DemoBooking />
      </section>

      <section id="precios" className="px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ember">Tarifas</p>
            <h2 className="mt-3 font-serif-display text-5xl italic leading-[0.95]">Mismas funciones. Pagás según tu flota.</h2>
            <p className="mt-4 text-muted-foreground">
              Mapa en vivo, app repartidor, integraciones y cobros con Mercado Pago. El precio mensual depende de cuántos repartidores tenés.
            </p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <HaloCard
                key={plan.key}
                aria-label={plan.key}
                padding="none"
                translucent={false}
                interactive={false}
                className={plan.featured ? 'ring-1 ring-foreground' : undefined}
              >
                <PlanBody plan={plan} />
              </HaloCard>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">14 días de prueba gratis · sin contrato anual · renovás según repartidores activos</p>
        </div>
      </section>

      <section id="empezar" className="mx-auto max-w-4xl px-5 py-24 text-center lg:px-8">
        <p className="font-serif-display text-[clamp(4rem,10vw,8rem)] leading-[0.85] italic">¿Arrancamos?</p>
        <p className="mx-auto mt-6 max-w-lg text-muted-foreground">
          Creá tu cuenta y empezá a coordinar tu logística en minutos. 14 días gratis, después pagás según tu cantidad de repartidores.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <HaloButton className="quiet-cta" render={<a href="/app" />} nativeButton={false}>
            Iniciar sesión
          </HaloButton>
          <a href="#demo" className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
            Agendar demo
          </a>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3 lg:px-8">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Hoja de ruta en tiempo real para tu logística. CABA y Gran Buenos Aires.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Producto</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#porque">Por qué Posta</a></li>
              <li><a href="#roles">Roles</a></li>
              <li><a href="#recorrido">Recorrido</a></li>
              <li><a href="#integraciones">Integraciones</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Empezar</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#descargar">Instalar app</a></li>
              <li><a href="#demo">Agendar demo</a></li>
              <li><a href="/seguimiento">Seguí tu envío</a></li>
              <li><a href="/app">Iniciar sesión</a></li>
              <li><a href="#precios">Tarifas</a></li>
              <li><a href="/privacidad">Política de privacidad</a></li>
            </ul>
          </div>
        </div>
        <p className="px-5 pb-8 text-center text-xs text-muted-foreground">© 2026 Posta · Hecho en Buenos Aires</p>
      </footer>
    </div>
  );
}
