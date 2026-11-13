/**
 * Kundendesign: jede Auslieferung bekommt das Erscheinungsbild des Kunden (Firmenname, Farbe, Logo) –
 * nicht das Türkis von INFINITY EARN. Unlesbare Farbwahl wird automatisch auf WCAG-AA-Kontrast angepasst.
 */
export interface Brand { company: string; primary: string; logoDataUrl: string | null; lang: 'de' | 'it' | 'en' }

export interface BrandResult { primary: string; primaryText: string; primarySoft: string; adjusted: boolean; contrast: number }

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: [number, number, number]): string => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Markenfarbe als Schaltflächen- und Linkfarbe: weißer Text braucht ≥ 4,5:1, notfalls wird abgedunkelt. */
export function brandColors(input: string): BrandResult {
  const base = hexToRgb(input) ?? [8, 127, 130];
  let rgb: [number, number, number] = [...base];
  let adjusted = !hexToRgb(input);
  let guard = 0;
  while (contrast(toHex(rgb), '#FFFFFF') < 4.5 && guard++ < 60) {
    rgb = [rgb[0] * 0.92, rgb[1] * 0.92, rgb[2] * 0.92];
    adjusted = true;
  }
  const primary = toHex(rgb);
  const soft = toHex([255 - (255 - rgb[0]) * 0.12, 255 - (255 - rgb[1]) * 0.12, 255 - (255 - rgb[2]) * 0.12]);
  return { primary, primaryText: '#FFFFFF', primarySoft: soft, adjusted, contrast: Math.round(contrast(primary, '#FFFFFF') * 100) / 100 };
}

/** Nur Rasterbild-Data-URLs als Logo (PNG/JPEG/WebP – kein SVG, weil SVG Skripte enthalten kann), höchstens 200 KB. */
export function safeLogo(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  if (dataUrl.length > 200_000) return null;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return null;
  return dataUrl;
}
