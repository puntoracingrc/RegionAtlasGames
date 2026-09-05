import type { Metadata } from "next";
import { IndexEntityList } from "@/components/index-entity-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Franquicias de videojuegos",
  description:
    "Franquicias de videojuegos conectadas por una misma propiedad, universo, marca o continuidad editorial.",
  alternates: { canonical: "/franquicia" },
};

export default function FranchisePage() {
  return <IndexEntityList kind="franchise" />;
}
