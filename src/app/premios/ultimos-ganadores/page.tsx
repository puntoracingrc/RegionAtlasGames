import { AwardPageShell } from "@/components/award-page-shell";
import { AwardResultList } from "@/components/award-results";
import { getLatestAwardWinners } from "@/lib/award-public-research";
import { awardMetadata } from "@/lib/award-seo";
export const metadata = awardMetadata("Últimos ganadores", "/premios/ultimos-ganadores", "Los resultados más recientes de los premios del videojuego.");
export default function LatestWinnersPage() {
  return <AwardPageShell title="Últimos ganadores"><AwardResultList results={getLatestAwardWinners().slice(0, 50)} covers /></AwardPageShell>;
}
