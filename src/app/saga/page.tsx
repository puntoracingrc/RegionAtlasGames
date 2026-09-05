import { IndexEntityList } from "@/components/index-entity-list";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sagas y subseries de videojuegos",
  description: "Sagas y subseries concretas organizadas dentro de sus franquicias.",
  alternates: { canonical: "/saga" },
};

export default function SeriesPage() {
  return <IndexEntityList kind="series" />;
}
