import type { Metadata } from "next";
import { AFFILIATE_DISCLOSURE_TEXT } from "@/lib/affiliate/disclosure";

export const metadata: Metadata = {
  title: "Disclosure de afiliación",
  description: "Información sobre enlaces de afiliado y ofertas externas en Region Atlas Games.",
};

export default function AffiliateDisclosurePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="eyebrow text-accent">Legal</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">Disclosure de afiliación</h1>
      <section className="mt-8 space-y-5 rounded-3xl border border-border bg-card p-6 text-base leading-8 text-muted shadow-soft">
        <p className="font-semibold text-foreground">{AFFILIATE_DISCLOSURE_TEXT}</p>
        <p>
          Region Atlas Games participa o puede participar en programas de afiliación. Algunos enlaces de compra pueden
          generar una comisión para Region Atlas Games si el usuario realiza una compra después de hacer clic. Esto no
          supone un coste adicional para el usuario.
        </p>
        <p>
          Region Atlas Games no vende directamente los productos enlazados. El precio final, disponibilidad, estado del
          producto, envío, impuestos, garantía y devolución dependen siempre de la tienda externa. Antes de comprar, el
          usuario debe revisar la información final en la web del vendedor.
        </p>
        <p>
          Region Atlas Games puede mostrar precios orientativos o precios consultados mediante fuentes autorizadas. Estos
          precios pueden cambiar sin previo aviso y no constituyen una oferta comercial directa de Region Atlas Games.
        </p>
      </section>
    </main>
  );
}
