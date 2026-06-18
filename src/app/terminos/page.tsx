import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Términos de uso de Region Atlas Games.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Términos de uso"
      updatedAt="18 de junio de 2026"
      sections={[
        {
          title: "Uso permitido",
          paragraphs: [
            "Region Atlas Games está pensado para consulta, catalogación, seguimiento de colección, contribución editorial y comparación orientativa de precios.",
            "No debe usarse para publicar contenido ilegal, engañoso, abusivo, spam, datos personales de terceros o anuncios falsos.",
          ],
        },
        {
          title: "Catálogo y precios",
          paragraphs: [
            "Los datos de catálogo, regiones, referencias y precios pueden proceder de fuentes internas, contribuciones, fuentes públicas o proveedores externos.",
            "Los precios son estimaciones o referencias de mercado y pueden no coincidir con el precio final de compra o venta.",
          ],
        },
        {
          title: "Anuncios y mensajes",
          paragraphs: [
            "Si usas funciones de venta, conversación o colección, eres responsable de la veracidad de la información que publiques.",
            "Region Atlas Games puede retirar contenido o limitar funciones si detecta abuso, fraude, incumplimiento o riesgo para otros usuarios.",
          ],
        },
        {
          title: "Cambios",
          paragraphs: [
            "Region Atlas Games puede actualizar funciones, textos legales, disponibilidad de servicios o condiciones de uso para adaptar el sitio a nuevas necesidades técnicas o legales.",
          ],
        },
      ]}
    />
  );
}
