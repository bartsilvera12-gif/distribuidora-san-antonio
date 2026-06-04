import Link from "next/link";

/**
 * Página 404 personalizada (reemplaza el default en inglés de Next.js).
 * Se renderiza dentro del shell de la app (sidebar + header).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-6xl font-extrabold tracking-tight text-[#4FAEB2]">404</p>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Página no encontrada</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        La página que buscás no existe o fue movida. Verificá la dirección o volvé al inicio.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91]"
      >
        Volver al Dashboard
      </Link>
    </div>
  );
}
