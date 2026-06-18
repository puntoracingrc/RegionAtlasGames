import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Aviso legal",
  description: "Aviso legal de Region Atlas Games.",
};

export default function LegalNoticePage() {
  return (
    <LegalPage
      title="Aviso legal"
      updatedAt="18 de junio de 2026"
      sections={[
        {
          title: "Objeto del sitio",
          paragraphs: [
            "Region Atlas Games es un catálogo informativo de videojuegos, regiones, referencias, precios orientativos, colecciones y enlaces a fuentes externas.",
            "La información publicada puede contener errores, quedar desactualizada o variar según la fuente consultada. Los precios mostrados son orientativos y no constituyen una oferta comercial directa.",
          ],
        },
        {
          title: "Responsabilidad",
          paragraphs: [
            "Region Atlas Games no garantiza disponibilidad, estado, precio final, envío, impuestos, garantía o devolución de productos vendidos por terceros.",
            "Los enlaces externos llevan a sitios ajenos. Cada usuario debe revisar las condiciones finales en la tienda, marketplace o fuente correspondiente antes de realizar cualquier operación.",
          ],
        },
        {
          title: "Propiedad intelectual",
          paragraphs: [
            "Las marcas, nombres de videojuegos, plataformas, compañías, imágenes y referencias pertenecen a sus respectivos titulares.",
            "Region Atlas Games utiliza esta información con fines de catalogación, documentación, comparación y referencia para coleccionistas.",
          ],
        },
        {
          title: "Contacto",
          paragraphs: [
            "Para solicitar correcciones, retirada de contenido o información adicional, puedes contactar con el equipo de Region Atlas Games a través de los canales disponibles en el sitio.",
          ],
        },
      ]}
    />
  );
}
