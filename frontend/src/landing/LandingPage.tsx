import { useEffect, useLayoutEffect, useState, type MouseEvent } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DirectionAwareTabs } from '@/components/ui/direction-aware-tabs';
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
import { trackEvent } from '@/lib/analytics';
import { DemoBooking } from './DemoBooking.tsx';

const LIVE_STATES = ['pendiente.', 'asignado.', 'en viaje.', 'en la puerta.'];

const APK_FALLBACK =
  'https://expo.dev/artifacts/eas/aIJTY4vilORXfj149rNpf76mMVY-hGPiaJc7CGWx7wI.apk';
const VERSION_API = 'https://envios-erp.up.railway.app/api/app/version';

const DEMO_HREF = '/demo';

const NAV = [
  { href: '#porque', label: 'Por qué' },
  { href: '#nosotros', label: 'Nosotros' },
  { href: '#roles', label: 'Roles' },
  { href: '#recorrido', label: 'Recorrido' },
  { href: '#descargar', label: 'App' },
  { href: '#precios', label: 'Tarifas' },
  { href: DEMO_HREF, label: 'Demo' },
];

const ABOUT_PILLARS = [
  {
    n: '01',
    title: 'De la calle, no del PowerPoint',
    body: 'Diseñamos mirando agencias reales de CABA y GBA: motos en la avenida, WhatsApp a mil y planillas que no cierran.',
  },
  {
    n: '02',
    title: 'Una sola verdad operativa',
    body: 'Si el pedido cambió de estado, lo ven todos. Agencia, vendedor y repartidor trabajan sobre el mismo mapa.',
  },
  {
    n: '03',
    title: 'Hecho en Buenos Aires',
    body: 'Zonas, horarios y distancias locales. Posta nació para la última milla del AMBA, no para un mercado genérico.',
  },
];

const MENU_LINKS = [
  ...NAV,
  { href: '/seguimiento', label: 'Seguí tu envío' },
  { href: '/app', label: 'Iniciar sesión' },
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
  { key: 'A medida', title: 'A medida', price: null, body: 'Para flotas grandes, varias sedes o necesidades específicas. Armamos el plan con vos.', featured: false },
];

const PLAN_POINTS = [
  'Mapa y flota en tiempo real',
  'App repartidor con GPS',
  'Mercado Libre, Tienda Nube, Shopify y Woo',
  'Zonas, asignación y estadísticas',
  'Cobrá envíos a vendedores con tu MP',
];

const SHOPS = [
  { name: 'Mercado Libre', sub: 'Flex', logo: '/mercadolibre-logo.png', note: 'Traé los envíos Flex de a uno o en masa. Los webhooks mantienen todo sincronizado.' },
  { name: 'Tienda Nube', sub: 'Express', logo: '/tiendanube-logo.png', note: 'Sincronizá tus pedidos Express y seguilos dentro de Posta, junto al resto.' },
  { name: 'Shopify', sub: 'Domicilio', logo: '/shopify-logo.svg', note: 'Cada venta con envío a domicilio aparece sola, lista para asignar.' },
  { name: 'WooCommerce', sub: 'Domicilio', logo: '/woocommerce-logo.svg', note: 'Pegás las claves de tu tienda y los pedidos pagos se importan solos.' },
];

const WHATSAPP_URL = 'https://wa.me/5491164622053';

function WhatsAppFloat() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp al +54 9 11 6462-2053"
      onClick={() => trackEvent('click_whatsapp')}
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.15 1.6 5.96L0 24l6.3-1.65a11.9 11.9 0 0 0 5.75 1.47h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.16-3.44-8.44zM12.06 21.82h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.45-4.44 9.88-9.88 9.88zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
      </svg>
    </a>
  );
}

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
          <circle r="6" fill="#ff5a2a" stroke="#1a1714" strokeWidth="2" />
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

function Phone({ className = '', height }: { className?: string; height?: string }) {
  const [island, setIsland] = useState<'default' | 'expanded' | 'large'>('expanded');
  const cycleIsland = () =>
    setIsland((size) => (size === 'default' ? 'expanded' : size === 'expanded' ? 'large' : 'default'));

  return (
    <IPhone17ProMax
      className={className}
      frameColor="graphite"
      time="14:32"
      batteryLevel={78}
      signalStrength={4}
      height={height}
      dynamicIslandSize={island}
      onDynamicIslandTap={cycleIsland}
      onScreenTap={cycleIsland}
      dynamicIslandContent={
        island === 'large' ? (
          <div className="flex h-full w-full flex-col justify-between py-1 text-left text-white">
            <div className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-[#ff5a2a]" />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium">Lucía Paz · en viaje</div>
                <div className="truncate text-[10px] text-white/65">Av. Rivadavia 4100</div>
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-white/55">
                <span>En camino</span>
                <span>6 min</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-2/3 rounded-full bg-[#ff5a2a]" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2 text-left text-white">
            <span className="size-1.5 shrink-0 rounded-full bg-[#ff5a2a]" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[11px] font-medium">Lucía Paz · en viaje</div>
              <div className="truncate text-[10px] text-white/65">Rivadavia 4100 · 6 min</div>
            </div>
          </div>
        )
      }
    >
      <RiderScreen />
    </IPhone17ProMax>
  );
}

function PlanBody({ plan }: { plan: (typeof PLANS)[number] }) {
  const custom = plan.price == null;
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{plan.key}</p>
        {plan.featured && <HaloBadge live>Recomendado</HaloBadge>}
      </div>
      <h3 className="font-serif-display text-4xl italic">{plan.title}</h3>
      <p className="text-sm text-muted-foreground">{plan.body}</p>
      {custom ? (
        <p className="text-3xl tracking-tight">
          Precio a consultar
        </p>
      ) : (
        <p className="text-3xl tracking-tight">
          ${plan.price}
          <span className="ml-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">por mes · ARS</span>
        </p>
      )}
      <ul className="space-y-2 text-sm">
        {PLAN_POINTS.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="text-signal">▸</span>
            {point}
          </li>
        ))}
      </ul>
      <a
        href={custom ? DEMO_HREF : '/app'}
        onClick={custom ? openDemoFromClick : () => trackEvent('click_login', { location: 'pricing' })}
        className="mt-auto inline-flex text-sm underline underline-offset-4"
      >
        {custom ? 'Consultar' : 'Probar 14 días gratis'}
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

function scrollToHash(hash: string, behavior: ScrollBehavior = 'smooth') {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior, block: 'start' });
}

function scrollToDemo(behavior: ScrollBehavior = 'smooth') {
  const el = document.getElementById('demo');
  if (!el) return;
  const scroller = document.scrollingElement ?? document.documentElement;
  const top = el.getBoundingClientRect().top + scroller.scrollTop - 96;
  scroller.scrollTo({ top: Math.max(0, top), behavior });
}

function isDemoEntry() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash;
  return hash === '#demo' || (path === DEMO_HREF && !hash);
}

function openDemo() {
  trackEvent('click_demo');
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== DEMO_HREF) {
    window.history.pushState(null, '', DEMO_HREF);
  }
  scrollToDemo();
}

function openDemoFromClick(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  openDemo();
}

function handleNavClick(href: string, event: MouseEvent<HTMLAnchorElement>) {
  if (href === DEMO_HREF) {
    openDemoFromClick(event);
    return;
  }
  if (!href.startsWith('#')) return;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path !== DEMO_HREF) return;
  event.preventDefault();
  const next = `${DEMO_HREF}${href}`;
  if (`${path}${window.location.hash}` !== next) {
    window.history.pushState(null, '', next);
  }
  scrollToHash(href);
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

  useEffect(() => {
    const ids = ['porque', 'nosotros', 'roles', 'recorrido', 'integraciones', 'descargar', 'demo', 'precios', 'empezar'];
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (!entry.isIntersecting || !id || seen.has(id)) continue;
          seen.add(id);
          trackEvent('view_section', { section: id });
        }
      },
      { threshold: 0.35 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!isDemoEntry()) return;
    const jump = () => scrollToDemo('auto');
    jump();
    const timers = [120, 500].map((ms) => window.setTimeout(jump, ms));
    window.addEventListener('load', jump);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('load', jump);
    };
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (isDemoEntry()) scrollToDemo('auto');
      else if (window.location.hash) scrollToHash(window.location.hash, 'auto');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('posta-theme', next);
    localStorage.setItem('posta_theme', next === 'dark' ? 'dark' : 'paper');
    setDark(!dark);
  }

  function handleMenuLinkClick(href: string, event: MouseEvent<HTMLAnchorElement>) {
    if (href === '/seguimiento') trackEvent('click_tracking');
    if (href === '/app') trackEvent('click_login', { location: 'menu' });
    if (href !== DEMO_HREF && !href.startsWith('#')) {
      setOpen(false);
      return;
    }
    event.preventDefault();
    setOpen(false);
    // Esperar a que el menú cierre y libere el scroll del body.
    window.setTimeout(() => {
      if (href === DEMO_HREF) {
        openDemo();
        return;
      }
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === DEMO_HREF) window.history.pushState(null, '', `${DEMO_HREF}${href}`);
      scrollToHash(href);
    }, 80);
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
        <div className="relative z-40 mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex flex-1 items-center gap-4 rounded-full border border-border/80 bg-background/70 px-4 py-2 backdrop-blur-xl">
            <Logo />
            <nav className="hidden items-center gap-4 text-xs uppercase tracking-[0.16em] text-muted-foreground md:flex" aria-label="Secciones">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) => handleNavClick(item.href, event)}
                  className={item.href === DEMO_HREF ? 'text-ember hover:text-foreground' : 'hover:text-foreground'}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <DispatchClock />
          </div>
          <a
            href="/seguimiento"
            onClick={() => trackEvent('click_tracking')}
            className="hidden text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground sm:inline"
          >
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={open ? 'close' : 'open'}
                initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
                transition={{ duration: 0.18 }}
                className="grid place-items-center"
              >
                {open ? <X className="size-4" /> : <Menu className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <>
              <motion.button
                key="menu-backdrop"
                type="button"
                aria-label="Cerrar menú"
                className="fixed inset-0 z-[45] bg-black/55 md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpen(false)}
              />
              <motion.div
                key="menu-panel"
                className="absolute left-4 right-4 top-full z-[50] mt-1 overflow-hidden rounded-3xl border border-border bg-background shadow-lg md:hidden"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <nav aria-label="Secciones" className="flex flex-col p-3">
                  {MENU_LINKS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className={`rounded-2xl px-3 py-2.5 text-sm hover:bg-foreground/5${item.href === DEMO_HREF ? ' text-ember' : ''}`}
                      onClick={(event) => handleMenuLinkClick(item.href, event)}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      <section className="relative min-h-[100svh] overflow-visible pt-28">
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
              <HaloButton
                className="quiet-cta"
                render={<a href="/app" onClick={() => trackEvent('click_login', { location: 'hero' })} />}
                nativeButton={false}
              >
                Entrar al panel
              </HaloButton>
              <a href={DEMO_HREF} onClick={openDemoFromClick} className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
                Agendar demo
              </a>
            </div>
            <div className="mt-6 hidden items-end gap-2 text-signal lg:flex">
              <SquigglyArrow width={140} height={64} direction="right" variant="bouncy" className="text-signal" />
              <span className="pb-3 text-[11px] uppercase tracking-[0.2em]">la moto de Lucía</span>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="origin-center px-4 py-6 lg:-rotate-6">
              <Phone className="!p-0" height="min(640px, 68vh)" />
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

      <section id="nosotros" className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-ember">Quiénes somos</p>
            <h2 className="mt-3 max-w-xl font-serif-display text-5xl italic leading-[0.95] sm:text-6xl">
              Somos la cabina detrás de tu flota.
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Posta es un equipo de Buenos Aires que construye la hoja de ruta en vivo para agencias, vendedores y repartidores.
              No armamos otro ERP: armamos la pantalla que necesitás cuando el pedido ya salió a la calle.
            </p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Arrancamos porque vimos la misma escena una y otra vez: etiquetas por WhatsApp, ubicaciones a ojo y nadie que sepa
              dónde está cada moto. Posta ordena eso sin sacar a tu gente del ritmo del día.
            </p>
            <a href={DEMO_HREF} onClick={openDemoFromClick} className="mt-8 inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
              Conocé el producto en 30 min
            </a>
          </div>
          <figure className="mx-auto w-full max-w-sm lg:mx-0 lg:ml-auto">
            <div className="overflow-hidden rounded-[2rem] border border-border bg-foreground/5">
              <img
                src="/ariel-jarovisky.jpg"
                alt="Ariel Jarovisky, fundador de Posta"
                className="aspect-[4/5] w-full object-cover object-[center_12%]"
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption className="mt-4">
              <p className="font-serif-display text-3xl italic leading-none">Ariel Jarovisky</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ember">Fundador</p>
            </figcaption>
          </figure>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {ABOUT_PILLARS.map((pillar) => (
            <HaloCard key={pillar.n} aria-label={pillar.title} padding="lg" translucent={false} interactive={false}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ember">{pillar.n}</p>
              <h3 className="mt-3 text-lg tracking-tight">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
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
                  <span className="grid h-12 w-14 place-items-center rounded-xl bg-white">
                    <img src={shop.logo} alt="" className="max-h-8 max-w-10 object-contain" />
                  </span>
                  <h3 className="mt-3 text-lg">{shop.name}</h3>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{shop.sub}</p>
                </div>
                <HaloBadge live variant="success">Conectado</HaloBadge>
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
            <HaloButton
              className="quiet-cta"
              render={<a href={apk} onClick={() => trackEvent('click_download_apk')} />}
              nativeButton={false}
            >
              Descargar APK
            </HaloButton>
            <a
              href="/app"
              onClick={() => trackEvent('click_install_ios')}
              className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm"
            >
              Instalar en Safari
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Android 8+ · iOS 15+ · requiere permiso de ubicación</p>
          <DirectionAwareTabs tabs={downloadTabs} className="mt-8 bg-foreground/10" />
        </div>
        <div className="flex justify-center">
          <Phone height="min(560px, 64vh)" />
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
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] uppercase tracking-[0.22em] text-ember">Tarifas</p>
            <h2 className="mt-3 font-serif-display text-5xl italic leading-[0.95]">Mismas funciones. Pagás según tu flota.</h2>
            <p className="mt-4 text-muted-foreground">
              Mapa en vivo, app repartidor, integraciones y cobros con Mercado Pago. El precio mensual depende de cuántos repartidores tenés.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <HaloButton
            className="quiet-cta"
            render={<a href="/app" onClick={() => trackEvent('click_login', { location: 'cta' })} />}
            nativeButton={false}
          >
            Iniciar sesión
          </HaloButton>
          <a href={DEMO_HREF} onClick={openDemoFromClick} className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm">
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
              <li><a href="#nosotros">Quiénes somos</a></li>
              <li><a href="#roles">Roles</a></li>
              <li><a href="#recorrido">Recorrido</a></li>
              <li><a href="#integraciones">Integraciones</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Empezar</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#descargar">Instalar app</a></li>
              <li><a href={DEMO_HREF} onClick={openDemoFromClick}>Agendar demo</a></li>
              <li><a href="/seguimiento" onClick={() => trackEvent('click_tracking')}>Seguí tu envío</a></li>
              <li><a href="/app" onClick={() => trackEvent('click_login', { location: 'footer' })}>Iniciar sesión</a></li>
              <li><a href="#precios">Tarifas</a></li>
              <li><a href="/privacidad">Política de privacidad</a></li>
            </ul>
          </div>
        </div>
        <p className="px-5 pb-8 text-center text-xs text-muted-foreground">© 2026 Posta · Hecho en Buenos Aires</p>
      </footer>
      <WhatsAppFloat />
    </div>
  );
}
