/** Número listo para wa.me. Argentina: antepone 549 y saca el 15 del celular. */
export function whatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  digits = digits.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  if (digits.startsWith('15') && digits.length > 8) digits = digits.slice(2);
  if (digits.length < 8) return null;
  if (!(digits.startsWith('9') && digits.length >= 11)) digits = `9${digits}`;
  return `54${digits}`;
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
