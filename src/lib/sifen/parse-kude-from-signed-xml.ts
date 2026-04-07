/**
 * Extrae datos legibles del rDE firmado (SIFEN v150) para armar el KuDE en PDF.
 * Solo lectura del XML; no altera firma ni envío SET.
 */
import { DOMParser } from "@xmldom/xmldom";
import type { Document, Element as XmlElement } from "@xmldom/xmldom";
import { SIFEN_EKUATIA_TARGET_NS } from "./sifen-xsi-schema-location";

const NS = SIFEN_EKUATIA_TARGET_NS;

function parseNumLoose(s: string): number {
  const t = s.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Si `dTotIVA` es 0 o ausente pero existen `dIVA5`/`dIVA10`, el total IVA mostrado es la suma de partes (XML / históricos). */
function resolverDTotIva(dTotIVAraw: string, dIVA5raw: string, dIVA10raw: string): string {
  const iv5 = parseNumLoose(dIVA5raw);
  const iv10 = parseNumLoose(dIVA10raw);
  const declared = parseNumLoose(dTotIVAraw);
  const sumPartes = iv5 + iv10;
  if (sumPartes > 0 && declared <= 0) {
    return String(Math.round(sumPartes));
  }
  if (declared > 0) {
    return String(Math.round(declared));
  }
  if (dTotIVAraw.trim() !== "") {
    return dTotIVAraw.trim();
  }
  return sumPartes > 0 ? String(Math.round(sumPartes)) : "0";
}

export type KudeItemRow = {
  codigo: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: string;
  precioUnit: string;
  totalLinea: string;
  /** Monto mostrado en columna Exentas (moneda operación). */
  montoExenta: string;
  montoGrav5: string;
  montoGrav10: string;
};

export type KudeParsedFromXml = {
  cdc: string;
  dFeEmiDE: string;
  dCarQR: string | null;
  monedaCodigo: string;
  monedaDescripcion: string;
  timbrado: {
    dNumTim: string;
    dEst: string;
    dPunExp: string;
    dNumDoc: string;
    dFeIniT: string;
  };
  emisor: {
    dRucEm: string;
    dDVEmi: string;
    dNomEmi: string;
    dDirEmi: string;
    dTelEmi: string;
    dEmailE: string;
  };
  receptor: {
    nombre: string;
    docLabel: string;
    docValue: string;
    direccion: string;
    telefono: string;
  };
  operacion: {
    condicionVenta: string;
    tipoOperacion: string;
  };
  totales: {
    dSubExe: string;
    dSub5: string;
    dSub10: string;
    dTotOpe: string;
    dTotGralOpe: string;
    dIVA5: string;
    dIVA10: string;
    dBaseGrav5: string;
    dBaseGrav10: string;
    dTBasGraIVA: string;
    /** Coherente con liquidación (prioriza dIVA5+dIVA10 si aplica). */
    dTotIVA: string;
  };
  items: KudeItemRow[];
};

function textOf(el: XmlElement | null | undefined): string {
  return el?.textContent?.trim() ?? "";
}

function firstNs(parent: XmlElement | undefined, tag: string): XmlElement | undefined {
  if (!parent) return undefined;
  return parent.getElementsByTagNameNS(NS, tag)[0] as XmlElement | undefined;
}

function parseRdeRoot(doc: Document): XmlElement {
  const rde =
    (doc.getElementsByTagNameNS(NS, "rDE")[0] as XmlElement | undefined) ??
    (doc.documentElement?.localName === "rDE" ? (doc.documentElement as XmlElement) : undefined);
  if (!rde) throw new Error("rDE no encontrado");
  return rde;
}

function tagTextOrZero(gTotSub: XmlElement, tag: string): string {
  const t = textOf(firstNs(gTotSub, tag));
  return t === "" ? "0" : t;
}

/**
 * Reparte `dTotOpeItem` en columnas Exentas / 5% / 10% según `gCamIVA` del ítem.
 */
function columnasMontosPorItem(totalLineaStr: string, gIva: XmlElement | undefined): {
  exenta: string;
  g5: string;
  g10: string;
} {
  const tot = totalLineaStr.trim() || "0";
  if (!gIva) {
    return { exenta: tot, g5: "0", g10: "0" };
  }
  const iAfec = textOf(firstNs(gIva, "iAfecIVA"));
  const tasa = parseNumLoose(textOf(firstNs(gIva, "dTasaIVA")));
  if (iAfec === "3" || tasa === 0) {
    return { exenta: tot, g5: "0", g10: "0" };
  }
  if (Math.abs(tasa - 5) < 0.1) {
    return { exenta: "0", g5: tot, g10: "0" };
  }
  if (Math.abs(tasa - 10) < 0.1) {
    return { exenta: "0", g5: "0", g10: tot };
  }
  if (iAfec === "1") {
    if (tasa <= 5.5) return { exenta: "0", g5: tot, g10: "0" };
    return { exenta: "0", g5: "0", g10: tot };
  }
  return { exenta: tot, g5: "0", g10: "0" };
}

export function parseKudeFromSignedRdeXml(xmlUtf8: string): KudeParsedFromXml {
  const doc = new DOMParser().parseFromString(xmlUtf8, "application/xml");
  const parseErr = doc.getElementsByTagName("parsererror")[0];
  if (parseErr) throw new Error("XML inválido (parsererror)");

  const rde = parseRdeRoot(doc);
  const de = firstNs(rde, "DE");
  if (!de) throw new Error("DE no encontrado");

  const idDe = de.getAttribute("Id")?.trim();
  if (!idDe) throw new Error("DE sin atributo Id (CDC)");
  const cdc = idDe;

  const gCamFuFD = firstNs(rde, "gCamFuFD");
  const dCarEl = gCamFuFD ? firstNs(gCamFuFD, "dCarQR") : undefined;
  const dCarQR = dCarEl ? textOf(dCarEl) : null;

  const gDatGralOpe = firstNs(de, "gDatGralOpe");
  if (!gDatGralOpe) throw new Error("gDatGralOpe no encontrado");
  const dFeEmiDE = textOf(firstNs(gDatGralOpe, "dFeEmiDE"));

  const gOpeCom = firstNs(gDatGralOpe, "gOpeCom");
  const monedaCodigo = gOpeCom ? textOf(firstNs(gOpeCom, "cMoneOpe")) || "PYG" : "PYG";
  const monedaDescripcion = gOpeCom ? textOf(firstNs(gOpeCom, "dDesMoneOpe")) : "";
  const tipoOperacion = gOpeCom ? textOf(firstNs(gOpeCom, "dDesTipTra")) : "";

  const gEmis = firstNs(gDatGralOpe, "gEmis");
  if (!gEmis) throw new Error("gEmis no encontrado");
  const emisor = {
    dRucEm: textOf(firstNs(gEmis, "dRucEm")),
    dDVEmi: textOf(firstNs(gEmis, "dDVEmi")),
    dNomEmi: textOf(firstNs(gEmis, "dNomEmi")),
    dDirEmi: textOf(firstNs(gEmis, "dDirEmi")),
    dTelEmi: textOf(firstNs(gEmis, "dTelEmi")),
    dEmailE: textOf(firstNs(gEmis, "dEmailE")),
  };

  const gDatRec = firstNs(gDatGralOpe, "gDatRec");
  if (!gDatRec) throw new Error("gDatRec no encontrado");
  const iNatRec = textOf(firstNs(gDatRec, "iNatRec"));
  let docLabel = "";
  let docValue = "";
  if (iNatRec === "1") {
    docLabel = "RUC";
    const ruc = textOf(firstNs(gDatRec, "dRucRec"));
    const dv = textOf(firstNs(gDatRec, "dDVRec"));
    docValue = dv ? `${ruc}-${dv}` : ruc;
  } else {
    docLabel = textOf(firstNs(gDatRec, "dDTipIDRec")) || "Documento";
    docValue = textOf(firstNs(gDatRec, "dNumIDRec"));
  }
  const receptor = {
    nombre: textOf(firstNs(gDatRec, "dNomRec")),
    docLabel,
    docValue,
    direccion: textOf(firstNs(gDatRec, "dDirRec")),
    telefono: textOf(firstNs(gDatRec, "dTelRec")),
  };

  const gTimb = firstNs(de, "gTimb");
  if (!gTimb) throw new Error("gTimb no encontrado");
  const timbrado = {
    dNumTim: textOf(firstNs(gTimb, "dNumTim")),
    dEst: textOf(firstNs(gTimb, "dEst")),
    dPunExp: textOf(firstNs(gTimb, "dPunExp")),
    dNumDoc: textOf(firstNs(gTimb, "dNumDoc")),
    dFeIniT: textOf(firstNs(gTimb, "dFeIniT")),
  };

  const gTotSub = firstNs(de, "gTotSub");
  if (!gTotSub) throw new Error("gTotSub no encontrado");

  const dIVA5raw = tagTextOrZero(gTotSub, "dIVA5");
  const dIVA10raw = tagTextOrZero(gTotSub, "dIVA10");
  const dTotIVAraw = textOf(firstNs(gTotSub, "dTotIVA"));
  const dTotIVAResuelto = resolverDTotIva(dTotIVAraw === "" ? "0" : dTotIVAraw, dIVA5raw, dIVA10raw);

  const dBaseGrav5 = textOf(firstNs(gTotSub, "dBaseGrav5"));
  const dBaseGrav10 = textOf(firstNs(gTotSub, "dBaseGrav10"));
  let dTBasGraIVA = textOf(firstNs(gTotSub, "dTBasGraIVA"));
  if (dTBasGraIVA === "") {
    const b5 = parseNumLoose(dBaseGrav5 || "0");
    const b10 = parseNumLoose(dBaseGrav10 || "0");
    const sum = b5 + b10;
    dTBasGraIVA = sum > 0 ? String(Math.round(sum)) : "0";
  }

  const totales = {
    dSubExe: tagTextOrZero(gTotSub, "dSubExe"),
    dSub5: tagTextOrZero(gTotSub, "dSub5"),
    dSub10: tagTextOrZero(gTotSub, "dSub10"),
    dTotOpe: tagTextOrZero(gTotSub, "dTotOpe"),
    dTotGralOpe: tagTextOrZero(gTotSub, "dTotGralOpe"),
    dIVA5: dIVA5raw,
    dIVA10: dIVA10raw,
    dBaseGrav5: dBaseGrav5 === "" ? "0" : dBaseGrav5,
    dBaseGrav10: dBaseGrav10 === "" ? "0" : dBaseGrav10,
    dTBasGraIVA,
    dTotIVA: dTotIVAResuelto,
  };

  const gDtipDE = firstNs(de, "gDtipDE");
  let condicionVenta = "";
  if (gDtipDE) {
    const gCamCond = firstNs(gDtipDE, "gCamCond");
    if (gCamCond) {
      condicionVenta = textOf(firstNs(gCamCond, "dDCondOpe"));
    }
  }

  const items: KudeItemRow[] = [];
  if (gDtipDE) {
    const nodes = gDtipDE.getElementsByTagNameNS(NS, "gCamItem");
    for (let i = 0; i < nodes.length; i++) {
      const it = nodes[i] as XmlElement;
      const codigo = textOf(firstNs(it, "dCodInt"));
      const descripcion = textOf(firstNs(it, "dDesProSer"));
      const unidadMedida = textOf(firstNs(it, "dDesUniMed"));
      const cantidad = textOf(firstNs(it, "dCantProSer"));
      const gVi = firstNs(it, "gValorItem");
      const precioUnit = textOf(firstNs(gVi ?? it, "dPUniProSer"));
      const gVr = gVi ? firstNs(gVi, "gValorRestaItem") : undefined;
      const totalLinea = textOf(firstNs(gVr ?? gVi ?? it, "dTotOpeItem"));
      const gIva = firstNs(it, "gCamIVA");
      const cols = columnasMontosPorItem(totalLinea, gIva);
      items.push({
        codigo: codigo || `L${i + 1}`,
        descripcion,
        unidadMedida: unidadMedida || "—",
        cantidad,
        precioUnit,
        totalLinea,
        montoExenta: cols.exenta,
        montoGrav5: cols.g5,
        montoGrav10: cols.g10,
      });
    }
  }

  return {
    cdc,
    dFeEmiDE,
    dCarQR: dCarQR && dCarQR.length > 0 ? dCarQR : null,
    monedaCodigo,
    monedaDescripcion,
    timbrado,
    emisor,
    receptor,
    operacion: {
      condicionVenta: condicionVenta || "—",
      tipoOperacion: tipoOperacion || "—",
    },
    totales,
    items,
  };
}

export function kudeFallbackQrUrl(cdc: string): string {
  const id = encodeURIComponent(cdc);
  return `https://ekuatia.set.gov.py/consultas/qr?nVersion=150&id=${id}`;
}
