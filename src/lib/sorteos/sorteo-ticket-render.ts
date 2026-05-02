import "server-only";

import { createHash } from "node:crypto";
import {
  mergeCustomTemplateFields,
  type SorteoTicketImageConfig,
} from "@/lib/sorteos/sorteo-ticket-types";

export type SorteoTicketRenderInput = {
  empresaNombre: string;
  sorteoNombre: string;
  clienteNombre?: string;
  documento?: string;
  telefono?: string;
  numeroOrden: string;
  cupones: string[];
  /** ISO o texto localizable */
  fechaHora: string;
  config: SorteoTicketImageConfig;
  /** bytes PNG/JPEG/WebP o null */
  logoBytes: Buffer | null;
  logoMime: string | null;
  backgroundBytes: Buffer | null;
  backgroundMime: string | null;
  /** Plantilla completa (custom_template) */
  templateBytes?: Buffer | null;
  templateMime?: string | null;
};

/** Canvas modo automático — comprobante vertical premium */
const WA = 1080;
const HA = 1350;
const PAD = 48;
const CARD_RX = 28;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function dataUrlFromBuffer(buf: Buffer, mime: string): string {
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

/** Cupón(es): tipografía grande, centrado en bloque */
function cuponesAutoSvg(
  cupones: string[],
  yStart: number,
  primary: string,
  accent: string
): string {
  if (cupones.length === 0) {
    return `<text x="${WA / 2}" y="${yStart}" text-anchor="middle" font-size="36" fill="${accent}">—</text>`;
  }
  if (cupones.length === 1) {
    return `<text x="${WA / 2}" y="${yStart + 80}" text-anchor="middle" font-size="72" font-weight="800" letter-spacing="2" fill="${primary}">${esc(
      cupones[0]!
    )}</text>`;
  }
  const lines: string[] = [];
  let y = yStart;
  const fs = cupones.length <= 4 ? 56 : cupones.length <= 9 ? 40 : 32;
  const step = fs + 14;
  for (const c of cupones.slice(0, 24)) {
    lines.push(
      `<text x="${WA / 2}" y="${y}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${primary}">${esc(c)}</text>`
    );
    y += step;
  }
  if (cupones.length > 24) {
    lines.push(
      `<text x="${WA / 2}" y="${y + 20}" text-anchor="middle" font-size="22" fill="${accent}">+${cupones.length - 24} más</text>`
    );
  }
  return lines.join("\n");
}

/**
 * Modo automático: layout vertical 1080×1350, logo destacado, datos en “cards”, cupón protagonista.
 */
export function buildSorteoTicketSvg(input: SorteoTicketRenderInput): string {
  const cfg = input.config;
  const bg = (cfg.backgroundColor ?? "#f1f5f9").trim();
  const primary = (cfg.primaryColor ?? "#0f172a").trim();
  const secondary = (cfg.secondaryColor ?? "#64748b").trim();
  const accent = (cfg.primaryColor ?? "#4f46e5").trim();
  const title = (cfg.title ?? "Comprobante de participación").trim();
  const footer = (cfg.legalFooter ?? "").trim();

  const showLogo = cfg.showLogo !== false;
  const showNombre = cfg.showClienteNombre !== false;
  const showDoc = cfg.showDocumento !== false;
  const showTel = cfg.showTelefono !== false;
  const showOrd = cfg.showNumeroOrden !== false;
  const showCup = cfg.showCupones !== false;
  const showSorteoNom = cfg.showSorteoNombre !== false;

  let headerLogo = "";
  if (showLogo) {
    if (input.logoBytes && input.logoMime) {
      const href = dataUrlFromBuffer(input.logoBytes, input.logoMime);
      /** Logo ancho arriba */
      headerLogo = `<image href="${href}" x="${(WA - 200) / 2}" y="${PAD}" width="200" height="200" preserveAspectRatio="xMidYMid meet"/>`;
    } else {
      const ini = initials(input.clienteNombre || input.empresaNombre);
      headerLogo = `<rect x="${(WA - 200) / 2}" y="${PAD}" width="200" height="200" rx="24" fill="#e2e8f0"/>
        <text x="${WA / 2}" y="${PAD + 120}" text-anchor="middle" font-size="64" font-weight="800" fill="#475569">${esc(ini)}</text>`;
    }
  }

  let bgPattern = "";
  if (input.backgroundBytes && input.backgroundMime) {
    const href = dataUrlFromBuffer(input.backgroundBytes, input.backgroundMime);
    bgPattern = `<image href="${href}" x="0" y="0" width="${WA}" height="${HA}" preserveAspectRatio="xMidYMid slice" opacity="0.12"/>`;
  }

  const yHeader = showLogo ? PAD + 220 : PAD + 20;
  const cardTop = yHeader + 28;
  const cardW = WA - PAD * 2;
  const cardX = PAD;

  const rows: { label: string; value: string }[] = [];
  if (showNombre && input.clienteNombre?.trim()) {
    rows.push({ label: "Participante", value: input.clienteNombre.trim() });
  }
  if (showDoc && input.documento?.trim()) {
    rows.push({ label: "Documento", value: input.documento.trim() });
  }
  if (showTel && input.telefono?.trim()) {
    rows.push({ label: "Teléfono", value: input.telefono.trim() });
  }
  if (showOrd) {
    rows.push({ label: "Nº de orden", value: input.numeroOrden });
  }
  if (showSorteoNom) {
    rows.push({ label: "Sorteo", value: input.sorteoNombre });
  }

  let rowY = cardTop + 56;
  const rowSvg = rows
    .map((r) => {
      const block = `<text x="${cardX + 36}" y="${rowY}" font-size="22" font-weight="600" fill="${secondary}">${esc(
        r.label
      )}</text>
      <text x="${cardX + 36}" y="${rowY + 28}" font-size="30" font-weight="700" fill="${primary}">${esc(r.value)}</text>`;
      rowY += 78;
      return block;
    })
    .join("\n");

  const cardH = Math.max(120 + rows.length * 78, 200);
  const cupY = cardTop + cardH + 80;
  const cupones = showCup ? input.cupones : [];
  const cupSvg = cuponesAutoSvg(cupones, cupY + 40, primary, secondary);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WA}" height="${HA}" viewBox="0 0 ${WA} ${HA}">
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="${WA}" height="${HA}" fill="${bg}"/>
  ${bgPattern}
  ${headerLogo}
  <text x="${WA / 2}" y="${yHeader}" text-anchor="middle" font-size="28" font-weight="700" fill="${secondary}">${esc(
    input.empresaNombre
  )}</text>
  <text x="${WA / 2}" y="${yHeader + 42}" text-anchor="middle" font-size="40" font-weight="800" fill="${primary}">${esc(
    title
  )}</text>
  <rect x="${cardX}" y="${cardTop}" width="${cardW}" height="${cardH}" rx="${CARD_RX}" fill="#ffffff" filter="url(#cardShadow)"/>
  ${rowSvg}
  <text x="${WA / 2}" y="${cupY}" text-anchor="middle" font-size="26" font-weight="700" fill="${accent}" letter-spacing="0.05em">CUPONES</text>
  ${cupSvg}
  <text x="${WA / 2}" y="${HA - PAD - (footer ? 56 : 28)}" text-anchor="middle" font-size="24" fill="${secondary}">${esc(
    input.fechaHora
  )}</text>
  ${
    footer
      ? `<text x="${WA / 2}" y="${HA - PAD - 12}" text-anchor="middle" font-size="20" fill="${secondary}">${esc(footer)}</text>`
      : ""
  }
</svg>`;
}

function buildCustomTemplateOverlaySvg(
  w: number,
  h: number,
  input: SorteoTicketRenderInput,
  layout: ReturnType<typeof mergeCustomTemplateFields>
): string {
  const font =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const pieces: string[] = [];

  const valMap: Record<string, string> = {
    cliente_nombre: input.clienteNombre?.trim() || "—",
    cliente_documento: input.documento?.trim() || "—",
    telefono: input.telefono?.trim() || "—",
    numero_orden: String(input.numeroOrden ?? ""),
    sorteo_nombre: input.sorteoNombre?.trim() || "—",
    cupones: input.cupones.length ? input.cupones.join("\n") : "—",
  };

  for (const key of Object.keys(layout)) {
    const L = layout[key]!;
    if (key === "cupones" && input.cupones.length > 0) {
      const lines = input.cupones;
      const fs = L.fontSize;
      const lineH = Math.round(fs * 1.25);
      const fixed = lines
        .map((line, i) => {
          const y = L.y + i * lineH;
          return `<text x="${L.x}" y="${y}" font-family="${font}" font-size="${fs}" font-weight="700" fill="${esc(
            L.color
          )}">${esc(line)}</text>`;
        })
        .join("\n");
      pieces.push(fixed);
    } else {
      const text = valMap[key] ?? "";
      pieces.push(
        `<text x="${L.x}" y="${L.y}" font-family="${font}" font-size="${L.fontSize}" font-weight="600" fill="${esc(
          L.color
        )}">${esc(text)}</text>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${pieces.join("\n")}
</svg>`;
}

async function renderCustomTemplateTicketPng(input: SorteoTicketRenderInput): Promise<Buffer> {
  const buf = input.templateBytes!;
  const sharpMod = (await import("sharp")).default;
  const meta = await sharpMod(buf).metadata();
  const w = meta.width && meta.width > 0 ? meta.width : input.config.custom_template_width ?? 1080;
  const h = meta.height && meta.height > 0 ? meta.height : input.config.custom_template_height ?? 1350;

  const fields = mergeCustomTemplateFields(input.config);
  const overlaySvg = buildCustomTemplateOverlaySvg(w, h, input, fields);
  const overlayPng = await sharpMod(Buffer.from(overlaySvg, "utf8")).png().toBuffer();

  const baseRgb = await sharpMod(buf)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();

  return sharpMod(baseRgb)
    .composite([{ input: overlayPng, left: 0, top: 0, blend: "over" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function renderSorteoTicketPng(svg: string): Promise<{ png: Buffer; hash: string }> {
  const sharpMod = (await import("sharp")).default;
  const png = await sharpMod(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer();
  const hash = createHash("sha256").update(png).digest("hex");
  return { png, hash };
}

/**
 * Punto único: plantilla personalizada (imagen + texto) o automático (SVG premium).
 */
export async function renderTicketPngUnified(input: SorteoTicketRenderInput): Promise<{ png: Buffer; hash: string }> {
  const mode = input.config.design_mode ?? "auto";
  if (
    mode === "custom_template" &&
    input.templateBytes &&
    input.templateBytes.length > 0 &&
    input.templateMime
  ) {
    try {
      const png = await renderCustomTemplateTicketPng(input);
      const hash = createHash("sha256").update(png).digest("hex");
      return { png, hash };
    } catch (e) {
      console.warn("[sorteo-ticket-render] custom_template_failed_fallback_auto", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const svg = buildSorteoTicketSvg(input);
  return renderSorteoTicketPng(svg);
}
