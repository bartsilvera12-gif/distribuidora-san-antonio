/**
 * KuDE PDF — representación gráfica del DE (pdf-lib, Vercel-safe).
 * Estilo factura PY; acento Neura #0EA5E9; textos en negro.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { KudeItemRow, KudeParsedFromXml } from "./parse-kude-from-signed-xml";

export type BuildKudePdfInput = {
  parsed: KudeParsedFromXml;
  numeroFactura: string;
  dProtAut: string | null;
  qrUrl: string;
};

const A4_W = 595.28;
const A4_H = 841.89;
const NEURA_BLUE: RGB = rgb(14 / 255, 165 / 255, 233 / 255);
const NEURA_BLUE_FILL: RGB = rgb(0.93, 0.97, 1);
const BLACK: RGB = rgb(0, 0, 0);
const GRAY: RGB = rgb(0.35, 0.35, 0.35);

function formatMonto(nStr: string, moneda: string): string {
  const n = Number.parseFloat(String(nStr).replace(",", "."));
  if (!Number.isFinite(n)) return String(nStr);
  if (moneda === "PYG" || moneda === "GS") {
    return Math.round(n).toLocaleString("es-PY");
  }
  return n.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function readLogoBytes(): Uint8Array | null {
  const p = path.join(process.cwd(), "public", "logo-neura.png");
  try {
    if (fs.existsSync(p)) return new Uint8Array(fs.readFileSync(p));
  } catch {
    /* ignore */
  }
  return null;
}

function yFromTop(page: PDFPage, fromTop: number): number {
  return page.getHeight() - fromTop;
}

function drawRectFromTop(
  page: PDFPage,
  left: number,
  fromTop: number,
  width: number,
  height: number,
  opts: { border?: RGB; borderW?: number; fill?: RGB }
) {
  page.drawRectangle({
    x: left,
    y: yFromTop(page, fromTop + height),
    width,
    height,
    borderColor: opts.border ?? NEURA_BLUE,
    borderWidth: opts.borderW ?? 0.75,
    color: opts.fill,
  });
}

function trunc(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function drawTableChunk(
  page: PDFPage,
  items: KudeItemRow[],
  parsed: KudeParsedFromXml,
  margin: number,
  innerW: number,
  fromTop: number,
  font: PDFFont,
  fontBold: PDFFont
): number {
  const fsz = 6.5;
  const headH = 15;
  const rowH = 11;
  const bodyH = Math.max(12, items.length * rowH + 6);
  const totalH = headH + bodyH;

  drawRectFromTop(page, margin, fromTop, innerW, totalH, { fill: rgb(1, 1, 1), border: NEURA_BLUE });
  drawRectFromTop(page, margin, fromTop, innerW, headH, { fill: NEURA_BLUE_FILL, border: NEURA_BLUE });

  const xCod = margin + 4;
  const xDesc = margin + 36;
  const xUm = margin + 186;
  const xPr = margin + 228;
  const xCan = margin + 282;
  const xEx = margin + 316;
  const x5 = margin + 366;
  const x10 = margin + 414;
  let t = fromTop + 4;

  const drawH = (txt: string, x: number, bold: boolean) => {
    page.drawText(txt, {
      x,
      y: yFromTop(page, t + fsz * 0.85),
      size: fsz,
      font: bold ? fontBold : font,
      color: bold ? NEURA_BLUE : BLACK,
    });
  };
  drawH("Código", xCod, true);
  drawH("Descripción", xDesc, true);
  drawH("Unidad", xUm, true);
  drawH("Precio", xPr, true);
  drawH("Cant.", xCan, true);
  drawH("Exentas", xEx, true);
  drawH("5%", x5, true);
  drawH("10%", x10, true);
  t += headH;

  let r = t + 3;
  for (const row of items) {
    const yb = yFromTop(page, r + fsz * 0.85);
    page.drawText(trunc(row.codigo, 10), { x: xCod, y: yb, size: fsz, font, color: BLACK });
    page.drawText(trunc(row.descripcion, 40), { x: xDesc, y: yb, size: fsz, font, color: BLACK });
    page.drawText(trunc(row.unidadMedida, 8), { x: xUm, y: yb, size: fsz, font, color: BLACK });
    page.drawText(formatMonto(row.precioUnit, parsed.monedaCodigo), { x: xPr, y: yb, size: fsz, font, color: BLACK });
    page.drawText(row.cantidad || "—", { x: xCan, y: yb, size: fsz, font, color: BLACK });
    page.drawText(formatMonto(row.montoExenta, parsed.monedaCodigo), { x: xEx, y: yb, size: fsz, font, color: BLACK });
    page.drawText(formatMonto(row.montoGrav5, parsed.monedaCodigo), { x: x5, y: yb, size: fsz, font, color: BLACK });
    page.drawText(formatMonto(row.montoGrav10, parsed.monedaCodigo), { x: x10, y: yb, size: fsz, font, color: BLACK });
    r += rowH;
  }

  return fromTop + totalH + 8;
}

export async function buildKudePdfBuffer(input: BuildKudePdfInput): Promise<Buffer> {
  const { parsed, numeroFactura, dProtAut, qrUrl } = input;

  const qrPng = await QRCode.toBuffer(qrUrl, {
    type: "png",
    width: 168,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`KuDE — Factura ${numeroFactura}`);
  pdfDoc.setAuthor("Neura ERP");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 32;
  const innerW = A4_W - margin * 2;
  let page = pdfDoc.addPage([A4_W, A4_H]);

  const nroTimbrado = `${parsed.timbrado.dEst}-${parsed.timbrado.dPunExp}-${parsed.timbrado.dNumDoc}`;
  const rucEmisor = `${parsed.emisor.dRucEm}-${parsed.emisor.dDVEmi}`;
  const tipoCambio =
    parsed.monedaCodigo === "PYG" || parsed.monedaCodigo === "GS"
      ? "1,00 (moneda local)"
      : "Ver documento electrónico";

  let cursorTop = margin;

  /* ── Header ── */
  const headerH = 120;
  drawRectFromTop(page, margin, cursorTop, innerW, headerH, { fill: rgb(1, 1, 1), border: NEURA_BLUE });

  let textLeft = margin + 8;
  const logoBytes = readLogoBytes();
  if (logoBytes) {
    try {
      const img = await pdfDoc.embedPng(logoBytes);
      const lw = 76;
      const sc = lw / img.width;
      const lh = img.height * sc;
      page.drawImage(img, {
        x: margin + 8,
        y: yFromTop(page, cursorTop + 8 + lh),
        width: lw,
        height: lh,
      });
      textLeft = margin + 8 + lw + 10;
    } catch {
      /* sin logo */
    }
  }

  const midX = margin + innerW * 0.52;
  let ln = cursorTop + 10;
  const put = (s: string, x: number, size: number, bold: boolean, col: RGB = BLACK) => {
    page.drawText(s, {
      x,
      y: yFromTop(page, ln + size * 0.85),
      size,
      font: bold ? fontBold : font,
      color: col,
    });
  };

  put(parsed.emisor.dNomEmi, textLeft, 10, true);
  ln += 12;
  put(parsed.emisor.dDirEmi, textLeft, 8, false);
  ln += 10;
  put(`Tel.: ${parsed.emisor.dTelEmi}  |  Email: ${parsed.emisor.dEmailE}`, textLeft, 8, false);
  ln += 11;
  put(`RUC: ${rucEmisor}`, textLeft, 9, true);
  ln += 12;
  put(`Timbrado Nº: ${parsed.timbrado.dNumTim}`, textLeft, 8, false);
  ln += 10;
  put(`Vigencia desde: ${parsed.timbrado.dFeIniT}`, textLeft, 8, false);

  let lnR = cursorTop + 10;
  const putHeaderRight = (s: string, size: number, bold: boolean, col: RGB = BLACK) => {
    page.drawText(s, {
      x: midX,
      y: yFromTop(page, lnR + size * 0.85),
      size,
      font: bold ? fontBold : font,
      color: col,
    });
  };
  putHeaderRight("Factura electrónica", 11, true, NEURA_BLUE);
  lnR += 13;
  putHeaderRight(`Nº: ${nroTimbrado}`, 9, false);
  lnR += 11;
  putHeaderRight(`Ref. ERP: ${numeroFactura}`, 8, false, GRAY);

  cursorTop += headerH + 8;

  const sectionTitle = (title: string) => {
    page.drawText(title, {
      x: margin,
      y: yFromTop(page, cursorTop + 9 * 0.85),
      size: 9,
      font: fontBold,
      color: NEURA_BLUE,
    });
    cursorTop += 12;
  };

  /* Operación */
  sectionTitle("DATOS DE LA OPERACIÓN");
  const opH = 54;
  drawRectFromTop(page, margin, cursorTop, innerW, opH, { fill: rgb(1, 1, 1), border: NEURA_BLUE });
  let lo = cursorTop + 8;
  const putBox = (s: string) => {
    page.drawText(s, {
      x: margin + 8,
      y: yFromTop(page, lo + 8 * 0.85),
      size: 8,
      font,
      color: BLACK,
    });
    lo += 11;
  };
  putBox(`Fecha de emisión: ${parsed.dFeEmiDE}`);
  putBox(`Condición de venta: ${parsed.operacion.condicionVenta}`);
  putBox(`Moneda: ${parsed.monedaDescripcion || parsed.monedaCodigo} (${parsed.monedaCodigo})`);
  putBox(`Tipo de cambio: ${tipoCambio}`);
  putBox(`Tipo de operación: ${parsed.operacion.tipoOperacion}`);
  cursorTop += opH + 8;

  /* Cliente */
  sectionTitle("DATOS DEL CLIENTE");
  const cliH = 56;
  drawRectFromTop(page, margin, cursorTop, innerW, cliH, { fill: rgb(1, 1, 1), border: NEURA_BLUE });
  let lc = cursorTop + 8;
  const putCli = (s: string, sz: number, bold: boolean) => {
    page.drawText(s, {
      x: margin + 8,
      y: yFromTop(page, lc + sz * 0.85),
      size: sz,
      font: bold ? fontBold : font,
      color: BLACK,
    });
    lc += bold ? 12 : 11;
  };
  putCli(`${parsed.receptor.docLabel}: ${parsed.receptor.docValue}`, 8, false);
  putCli(trunc(parsed.receptor.nombre, 78), 9, true);
  putCli(`Dirección: ${parsed.receptor.direccion || "—"}`, 8, false);
  putCli(`Teléfono: ${parsed.receptor.telefono || "—"}`, 8, false);
  cursorTop += cliH + 8;

  /* Tabla ítems (paginar si hace falta) */
  sectionTitle("DETALLE DE LA MERCADERÍA / SERVICIOS");
  const footerReserve = 175;
  const rowH = 11;
  const headH = 15;
  let idx = 0;
  const items = parsed.items;
  while (idx < items.length) {
    let room = A4_H - cursorTop - footerReserve;
    if (room < headH + rowH + 16) {
      page = pdfDoc.addPage([A4_W, A4_H]);
      cursorTop = margin;
      room = A4_H - cursorTop - footerReserve;
    }
    const maxRows = Math.max(1, Math.floor((room - headH - 10) / rowH));
    const slice = items.slice(idx, idx + maxRows);
    if (slice.length === 0) {
      page = pdfDoc.addPage([A4_W, A4_H]);
      cursorTop = margin;
      continue;
    }
    cursorTop = drawTableChunk(page, slice, parsed, margin, innerW, cursorTop, font, fontBold);
    idx += slice.length;
    if (idx < items.length) {
      page = pdfDoc.addPage([A4_W, A4_H]);
      cursorTop = margin;
      page.drawText("(Continúa detalle)", {
        x: margin,
        y: yFromTop(page, cursorTop + 8),
        size: 8,
        font,
        color: GRAY,
      });
      cursorTop += 14;
    }
  }

  /* Totales + IVA */
  if (A4_H - cursorTop < 150) {
    page = pdfDoc.addPage([A4_W, A4_H]);
    cursorTop = margin;
  }
  sectionTitle("TOTALES Y LIQUIDACIÓN DEL IVA");
  const totH = 132;
  drawRectFromTop(page, margin, cursorTop, innerW, totH, { fill: rgb(1, 1, 1), border: NEURA_BLUE });

  const xL = margin + 10;
  const xR = margin + innerW * 0.48;
  let lt = cursorTop + 10;

  const putL = (a: string, b: string, bold: boolean) => {
    page.drawText(a, { x: xL, y: yFromTop(page, lt + 8 * 0.85), size: 8, font, color: BLACK });
    page.drawText(b, {
      x: xL + 132,
      y: yFromTop(page, lt + 8 * 0.85),
      size: 8,
      font: bold ? fontBold : font,
      color: BLACK,
    });
    lt += 10;
  };
  putL("Subtotal exentas:", formatMonto(parsed.totales.dSubExe, parsed.monedaCodigo), true);
  putL("Subtotal gravadas 5%:", formatMonto(parsed.totales.dSub5, parsed.monedaCodigo), true);
  putL("Subtotal gravadas 10%:", formatMonto(parsed.totales.dSub10, parsed.monedaCodigo), true);
  lt += 2;
  page.drawLine({
    start: { x: margin + 6, y: yFromTop(page, lt) },
    end: { x: margin + innerW - 6, y: yFromTop(page, lt) },
    thickness: 0.45,
    color: NEURA_BLUE,
  });
  lt += 8;
  page.drawText("Total de la operación:", {
    x: xL,
    y: yFromTop(page, lt + 9 * 0.85),
    size: 9,
    font: fontBold,
    color: BLACK,
  });
  page.drawText(formatMonto(parsed.totales.dTotOpe, parsed.monedaCodigo), {
    x: xL + 142,
    y: yFromTop(page, lt + 9 * 0.85),
    size: 9,
    font: fontBold,
    color: BLACK,
  });
  lt += 13;
  putL("Total en guaraníes:", formatMonto(parsed.totales.dTotGralOpe, parsed.monedaCodigo), true);

  let rt = cursorTop + 10;
  page.drawText("Liquidación IVA", {
    x: xR,
    y: yFromTop(page, rt + 9 * 0.85),
    size: 9,
    font: fontBold,
    color: NEURA_BLUE,
  });
  rt += 12;
  const putIvaLine = (lab: string, val: string) => {
    page.drawText(lab, { x: xR, y: yFromTop(page, rt + 8 * 0.85), size: 8, font, color: BLACK });
    page.drawText(val, {
      x: xR + 108,
      y: yFromTop(page, rt + 8 * 0.85),
      size: 8,
      font: fontBold,
      color: BLACK,
    });
    rt += 10;
  };
  putIvaLine("Base gravada 5%:", formatMonto(parsed.totales.dBaseGrav5, parsed.monedaCodigo));
  putIvaLine("IVA 5%:", formatMonto(parsed.totales.dIVA5, parsed.monedaCodigo));
  putIvaLine("Base gravada 10%:", formatMonto(parsed.totales.dBaseGrav10, parsed.monedaCodigo));
  putIvaLine("IVA 10%:", formatMonto(parsed.totales.dIVA10, parsed.monedaCodigo));
  rt += 4;
  page.drawLine({
    start: { x: xR - 2, y: yFromTop(page, rt) },
    end: { x: margin + innerW - 8, y: yFromTop(page, rt) },
    thickness: 0.5,
    color: NEURA_BLUE,
  });
  rt += 8;
  page.drawText("Total IVA:", {
    x: xR,
    y: yFromTop(page, rt + 9 * 0.85),
    size: 9,
    font: fontBold,
    color: BLACK,
  });
  page.drawText(formatMonto(parsed.totales.dTotIVA, parsed.monedaCodigo), {
    x: xR + 108,
    y: yFromTop(page, rt + 9 * 0.85),
    size: 9,
    font: fontBold,
    color: BLACK,
  });

  cursorTop += totH + 10;

  /* Pie */
  if (A4_H - cursorTop < 160) {
    page = pdfDoc.addPage([A4_W, A4_H]);
    cursorTop = margin;
  }
  drawRectFromTop(page, margin, cursorTop, innerW, 152, { fill: rgb(1, 1, 1), border: NEURA_BLUE });

  const qrImg = await pdfDoc.embedPng(new Uint8Array(qrPng));
  const qSz = 92;
  page.drawImage(qrImg, {
    x: margin + 12,
    y: yFromTop(page, cursorTop + 12 + qSz),
    width: qSz,
    height: qSz,
  });

  const tx = margin + 12 + qSz + 14;
  let ft = cursorTop + 14;
  page.drawText("Consulta de validez (e-kuatia / SET)", {
    x: tx,
    y: yFromTop(page, ft + 8 * 0.85),
    size: 8,
    font: fontBold,
    color: NEURA_BLUE,
  });
  ft += 11;
  page.drawText(`CDC: ${parsed.cdc}`, {
    x: tx,
    y: yFromTop(page, ft + 7 * 0.85),
    size: 7,
    font,
    color: BLACK,
  });
  ft += 9;
  if (dProtAut) {
    page.drawText(`dProtAut: ${dProtAut}`, {
      x: tx,
      y: yFromTop(page, ft + 7 * 0.85),
      size: 7,
      font,
      color: BLACK,
    });
    ft += 9;
  }
  page.drawText("Escanee el código QR o consulte el CDC en el portal e-kuatia.", {
    x: tx,
    y: yFromTop(page, ft + 7 * 0.85),
    size: 7,
    font,
    color: GRAY,
  });
  ft += 22;
  page.drawText("ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML)", {
    x: margin + 8,
    y: yFromTop(page, ft + 7 * 0.85),
    size: 7,
    font: fontBold,
    color: NEURA_BLUE,
  });
  ft += 10;
  page.drawText("Generado con Neura ERP", {
    x: margin + 8,
    y: yFromTop(page, ft + 7 * 0.85),
    size: 7,
    font,
    color: GRAY,
  });

  return Buffer.from(await pdfDoc.save());
}
