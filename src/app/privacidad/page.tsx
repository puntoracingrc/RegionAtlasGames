import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Política de privacidad de Region Atlas Games.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      updatedAt="18 de junio de 2026"
      sections={[
        {
          title: "Datos que pueden tratarse",
          paragraphs: [
            "Region Atlas Games puede tratar datos necesarios para crear cuenta, iniciar sesión, guardar preferencias, gestionar colección, publicar anuncios, enviar mensajes internos o usar herramientas de contribución.",
            "Estos datos pueden incluir email, nombre visible, ajustes de usuario, elementos de colección, anuncios, conversaciones y actividad necesaria para mantener la seguridad del servicio.",
          ],
        },
        {
          title: "Finalidad",
          paragraphs: [
            "Los datos se usan para prestar las funciones solicitadas, mantener sesiones, proteger cuentas, recordar preferencias y mejorar la calidad del catálogo.",
            "No se deben introducir datos personales innecesarios en campos públicos, descripciones, mensajes o formularios de contribución.",
          ],
        },
        {
          title: "Servicios externos",
          paragraphs: [
            "El sitio puede usar proveedores externos para autenticación, almacenamiento, despliegue, correo, analítica técnica, afiliación o enlaces a marketplaces.",
            "Cuando navegas a una web externa, el tratamiento de datos queda sujeto a la política de privacidad de ese tercero.",
          ],
        },
        {
          title: "Derechos",
          paragraphs: [
            "Puedes solicitar acceso, rectificación o eliminación de tus datos cuando corresponda. Algunas solicitudes pueden requerir verificar tu identidad para proteger la cuenta.",
            "También puedes cerrar sesión, modificar ajustes o dejar de usar funciones que requieran cuenta.",
          ],
        },
      ]}
    />
  );
}
