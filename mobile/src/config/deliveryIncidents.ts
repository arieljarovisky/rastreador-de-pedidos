export interface DeliveryIncident {
  id: string;
  label: string;
  message: (input: { clientName: string; address: string; orderId: string }) => string;
}

function hello(clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0];
  return first ? `Hola ${first}` : 'Hola';
}

export const DELIVERY_INCIDENTS: DeliveryIncident[] = [
  {
    id: 'absent',
    label: 'Cliente ausente',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. Pasé por ${address} con tu pedido ${orderId} y no había nadie para recibirlo. Cuando puedas, respondé este mensaje para coordinar la entrega.`,
  },
  {
    id: 'no-answer',
    label: 'No atiende el teléfono',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. Estoy en ${address} con tu pedido ${orderId} y no pude comunicarme por teléfono. Respondé cuando puedas para coordinar la entrega.`,
  },
  {
    id: 'bad-address',
    label: 'Dirección incorrecta',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. No pude encontrar la dirección de tu pedido ${orderId} (${address}). ¿Me confirmás la dirección correcta?`,
  },
  {
    id: 'closed',
    label: 'Local cerrado',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. Llegué a ${address} con tu pedido ${orderId} y el lugar estaba cerrado. Avisame un horario en el que podamos entregarlo.`,
  },
  {
    id: 'no-access',
    label: 'No se puede ingresar',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. No pude ingresar a ${address} para entregar el pedido ${orderId}. ¿Me indicás cómo llegar o un punto de encuentro?`,
  },
  {
    id: 'rejected',
    label: 'Rechazó el paquete',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. En ${address} no aceptaron el pedido ${orderId}. Quedo atento si hay que coordinar otra entrega.`,
  },
  {
    id: 'reschedule',
    label: 'Pide reprogramar',
    message: ({ clientName, address, orderId }) =>
      `${hello(clientName)}, soy el repartidor de Posta. No pude entregar hoy el pedido ${orderId} en ${address}. ¿Qué día te queda mejor para recibirlo?`,
  },
];

export function incidentWhatsappText(
  incident: DeliveryIncident,
  input: { clientName: string; address: string; orderId: string },
  note: string
): string {
  const extra = note.trim();
  const base = incident.message(input);
  return extra ? `${base}\n\n${extra}` : base;
}
