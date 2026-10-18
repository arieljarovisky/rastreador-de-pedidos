/** ID visible: oculta el prefijo interno de la flota demo. */
export function formatOrderId(id: string): string {
  return id.replace(/^DEMO-/i, '');
}
