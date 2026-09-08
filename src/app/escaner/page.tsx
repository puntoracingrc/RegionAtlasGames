import type { Metadata } from "next";
import platformData from "../../../data/platforms.json";
import { SiteNav } from "@/components/site-nav";
import { GameScanner } from "@/components/game-scanner";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Escáner de juegos",
  description: "Análisis fotográfico de juegos, regiones y componentes con el engine de Region Atlas.",
  alternates: { canonical: `${getSiteUrl()}/escaner` },
};

export default function ScannerPage() {
  const platforms = platformData.filter((p) => !("active" in p) || p.active !== false)
    .map(({ slug, name, manufacturer }) => ({ slug, name, manufacturer }));
  return <><SiteNav /><main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
    <header className="mb-7 border-b border-border pb-5">
      <h1 className="text-3xl font-bold text-foreground">Escáner</h1>
      <p className="mt-2 text-muted">Identificación del juego, región y componentes</p>
    </header>
    <GameScanner platforms={platforms} />
  </main></>;
}
