/** Separador perforado de ticket — solo en tema papel */
export default function TicketDivider({ className = '' }: { className?: string }) {
  return <div className={`ticket-divider ${className}`.trim()} role="separator" aria-hidden="true" />;
}
