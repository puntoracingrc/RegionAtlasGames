import Link from "next/link";

type Props = {
  compact?: boolean;
  className?: string;
  itemCount?: number;
};

export function CollectionValueUpsell({ compact, className = "", itemCount }: Props) {
  if (compact) {
    return (
      <span className={`text-muted ${className}`.trim()}>
        Valor total —{" "}
        <Link href="/ajustes" className="text-accent hover:underline">
          Pro
        </Link>
      </span>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 via-card to-transparent p-6 sm:p-8 ${className}`.trim()}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Valor de tu colección
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        Disponible con plan Pro
      </p>
      {itemCount != null && itemCount > 0 && (
        <p className="mt-1 text-sm text-muted">
          Tienes <strong className="text-foreground">{itemCount}</strong> juegos en tu colección.
        </p>
      )}
      <p className="mt-2 max-w-xl text-sm text-muted">
        Puedes importar y gestionar toda tu colección gratis. El valor total estimado y el desglose
        por plataforma se muestran solo en cuentas de pago.
      </p>
      <Link href="/ajustes" className="btn-primary mt-4 inline-flex">
        Ver plan Pro
      </Link>
    </section>
  );
}
