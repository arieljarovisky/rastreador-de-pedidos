/**
 * Referencia visual de componentes Posta (no montado en producción).
 * Importá este módulo en una ruta de dev si querés previsualizar tokens.
 */
import PostaLogo from './PostaLogo.tsx';
import PostaButton from './PostaButton.tsx';
import StatusBadge from './StatusBadge.tsx';
import ConnectionIndicator from './ConnectionIndicator.tsx';
import PaperCard from './PaperCard.tsx';
import TicketDivider from './TicketDivider.tsx';
import { OrderStatus } from '../../types.js';

const ALL_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.ASSIGNED,
  OrderStatus.DELIVERING,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export default function ThemeShowcase() {
  return (
    <div className="grid md:grid-cols-2 gap-8 p-8">
      <section className="theme-dark bg-bg text-text rounded-lg p-6 space-y-4" data-theme="dark">
        <h2 className="font-display font-bold text-lg tracking-[-0.02em]">Tema oscuro</h2>
        <PostaLogo variant="dark" size={40} />
        <div className="flex flex-wrap gap-2">
          <PostaButton>Primario</PostaButton>
          <PostaButton variant="secondary">Secundario</PostaButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <span key={s}>
              <StatusBadge status={s} />
            </span>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <ConnectionIndicator isOnline wsConnected />
          <ConnectionIndicator isOnline wsConnected={false} />
          <ConnectionIndicator isOnline={false} wsConnected={false} />
        </div>
        <p className="mono-label">PED-0042 · 14:32 ART</p>
      </section>

      <section className="theme-paper min-h-full p-6 space-y-4" data-theme="paper">
        <h2 className="font-display font-bold text-lg tracking-[-0.02em] text-text">Tema papel</h2>
        <PostaLogo variant="paper" size={40} />
        <PaperCard className="p-4 space-y-3">
          <p className="mono-label text-text-muted">Ingreso</p>
          <PostaButton>Ingresar al panel</PostaButton>
          <PostaButton variant="secondary">Crear cuenta</PostaButton>
          <TicketDivider />
          <StatusBadge status={OrderStatus.DELIVERING} paper />
        </PaperCard>
      </section>
    </div>
  );
}
