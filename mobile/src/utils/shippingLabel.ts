import { apiUrl } from '../config';
import type { Order } from '../types';

export type ShippingLabelFile = {
  kind: 'image' | 'pdf';
  mime: string;
  base64: string;
};

const PDFJS_VERSION = '3.11.174';
const PDFJS_MAIN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

type PdfJsSources = { main: string; worker: string };

let pdfJsSources: Promise<PdfJsSources> | null = null;

export function labelCaption(order: Order): string {
  const notes = order.notes?.trim();
  if (notes) return notes;
  if (order.externalSource === 'mercadolibre' && order.externalOrderId) {
    return `Mercado Libre · Orden #${order.externalOrderId}`;
  }
  if (order.externalSource === 'foto') return 'Etiqueta fotografiada';
  return `Etiqueta · ${order.id}`;
}

export function labelAction(order: Order): string {
  return order.externalSource === 'foto' ? 'Ver foto de la etiqueta →' : 'Ver etiqueta de envío →';
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  const len = bytes.length;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(
      alphabet[(n >> 18) & 63] +
        alphabet[(n >> 12) & 63] +
        alphabet[(n >> 6) & 63] +
        alphabet[n & 63]
    );
  }
  if (i < len) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const n = (b0 << 16) | (b1 << 8);
    parts.push(
      alphabet[(n >> 18) & 63] +
        alphabet[(n >> 12) & 63] +
        (i + 1 < len ? alphabet[(n >> 6) & 63] : '=') +
        '='
    );
  }
  return parts.join('');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('La descarga tardó demasiado. Verificá tu conexión e intentá de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function kindOf(contentType: string, base64: string): { kind: 'image' | 'pdf'; mime: string } {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() || '';
  if (mime.startsWith('image/')) return { kind: 'image', mime };
  if (mime === 'application/pdf' || base64.startsWith('JVBERi')) {
    return { kind: 'pdf', mime: 'application/pdf' };
  }
  return { kind: 'pdf', mime: 'application/pdf' };
}

/** Descarga la etiqueta del pedido (PDF de ML o Posta, o foto). */
export async function fetchShippingLabel(token: string, orderId: string): Promise<ShippingLabelFile> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/orders/${orderId}/shipping-label`),
    { headers: { Authorization: `Bearer ${token}` } },
    60_000
  );
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || contentType.includes('application/json') || contentType.startsWith('text/')) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? 'No se pudo obtener la etiqueta de envío.'
    );
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('La etiqueta llegó vacía.');
  }
  const base64 = toBase64(new Uint8Array(buffer));
  const detected = kindOf(contentType, base64);
  return { kind: detected.kind, mime: detected.mime, base64 };
}

async function fetchScript(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {}, 25_000);
  if (!res.ok) {
    throw new Error('No se pudo preparar el visor de etiquetas.');
  }
  return res.text();
}

/** pdf.js en el hilo principal: el visor no depende de Web Workers. */
export function loadPdfJsSources(): Promise<PdfJsSources> {
  if (!pdfJsSources) {
    pdfJsSources = Promise.all([fetchScript(PDFJS_MAIN), fetchScript(PDFJS_WORKER)])
      .then(([main, worker]) => ({ main, worker }))
      .catch((err) => {
        pdfJsSources = null;
        throw err instanceof Error ? err : new Error('No se pudo preparar el visor de etiquetas.');
      });
  }
  return pdfJsSources;
}

function escapeScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script');
}

/** HTML autónomo que dibuja el PDF. El worker se carga antes para usar el hilo principal. */
export function buildPdfHtml(base64: string, sources: PdfJsSources): string {
  const payload = JSON.stringify(base64);
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />',
    '<style>html,body{margin:0;background:#101218}canvas{width:100%;height:auto;display:block;background:#fff;margin-bottom:8px}',
    '#status{color:#f3f0e8;font:15px sans-serif;padding:24px}</style></head><body>',
    '<p id="status">Preparando etiqueta…</p><div id="pages"></div>',
    '<script>try{',
    escapeScript(sources.worker),
    '}catch(e){window.__pdfBootError=String(e&&e.message||e);}</script>',
    '<script>try{',
    escapeScript(sources.main),
    '}catch(e){window.__pdfBootError=String(e&&e.message||e);}</script>',
    '<script>(async function(){function fail(message){var el=document.getElementById("status");',
    'if(el)el.textContent=message;if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",message:message}));}}',
    'if(window.__pdfBootError){fail("No se pudo preparar el visor.");return;}',
    'try{var lib=window.pdfjsLib;if(!lib||!lib.getDocument){fail("No se pudo preparar el visor.");return;}',
    'var raw=atob(',
    payload,
    ');var bytes=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);',
    'var pdf=await lib.getDocument({data:bytes}).promise;var container=document.getElementById("pages");',
    'var status=document.getElementById("status");if(status)status.remove();',
    'var width=Math.max(document.body.clientWidth||window.innerWidth||360,280);',
    'var pixelRatio=Math.min(window.devicePixelRatio||1,2);',
    'for(var n=1;n<=pdf.numPages;n++){var page=await pdf.getPage(n);var base=page.getViewport({scale:1});',
    'var viewport=page.getViewport({scale:(width/base.width)*pixelRatio});var canvas=document.createElement("canvas");',
    'canvas.width=viewport.width;canvas.height=viewport.height;container.appendChild(canvas);',
    'await page.render({canvasContext:canvas.getContext("2d"),viewport:viewport}).promise;}',
    'if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:"ready"}));}',
    '}catch(err){fail(err&&err.message?String(err.message):"No se pudo mostrar la etiqueta.");}})();</script>',
    '</body></html>',
  ].join('');
}
