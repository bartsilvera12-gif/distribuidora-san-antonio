/**
 * Marca de la instancia (white-label).
 *
 * Centraliza el nombre y el logo de la marca para no esparcir el string
 * "Zentra" (nombre de la plataforma) por la UI de cara al cliente final.
 * Para reutilizar este código en otra instancia mono-cliente, basta cambiar
 * estas constantes (o conectarlas a una env `NEXT_PUBLIC_*`).
 */
export const BRAND = {
  /** Nombre completo — títulos, `alt` de logo, white-label de cara al cliente. */
  name: "Distribuidora San Antonio",
  /** Forma corta para los eyebrows de sección ("San Antonio · Operaciones"). */
  shortName: "San Antonio",
  /** Inicial para el mark cuadrado del dashboard. */
  initial: "S",
  /** Logo oficial de la marca (archivo en /public). */
  logo: "/brand/sanantonio-logo.png",
} as const;
