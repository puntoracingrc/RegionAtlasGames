import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Política de cookies",
  description: "Política de cookies de Region Atlas Games.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Política de cookies"
      updatedAt="18 de junio de 2026"
      sections={[
        {
          title: "Qué son las cookies",
          paragraphs: [
            "Las cookies y tecnologías similares permiten guardar información en el navegador para recordar sesión, preferencias o estado de la interfaz.",
            "Algunas son necesarias para que funciones como autenticación, cuenta, colección o preferencias funcionen correctamente.",
          ],
        },
        {
          title: "Cookies necesarias",
          paragraphs: [
            "Region Atlas Games puede usar cookies técnicas para mantener sesión, verificar autenticación, conservar preferencias de tema o proteger formularios.",
            "Estas cookies son necesarias para prestar el servicio solicitado y no se usan para vender datos personales.",
          ],
        },
        {
          title: "Servicios de terceros",
          paragraphs: [
            "Al abrir enlaces externos, tiendas, marketplaces o servicios de autenticación, esos terceros pueden establecer sus propias cookies según sus políticas.",
            "Region Atlas Games no controla las cookies instaladas por sitios externos visitados desde enlaces salientes.",
          ],
        },
        {
          title: "Gestión",
          paragraphs: [
            "Puedes borrar o bloquear cookies desde la configuración de tu navegador. Si bloqueas cookies necesarias, algunas funciones del sitio pueden dejar de funcionar.",
          ],
        },
      ]}
    />
  );
}
