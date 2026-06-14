import Link from "next/link";
import type { CompanyCollaborator } from "@/lib/company-profile";

export function CompanyCollaborators({
  collaborators,
  selfName,
}: {
  collaborators: CompanyCollaborator[];
  selfName: string;
}) {
  if (collaborators.length === 0) return null;

  const developers = collaborators.filter((item) => item.role === "developer");
  const publishers = collaborators.filter((item) => item.role === "publisher");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Compañías relacionadas</h2>
        <p className="mt-1 text-sm text-foreground/75">
          Desarrolladoras y publicadoras con las que {selfName} ha coincidido en el catálogo.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {developers.length > 0 && (
          <CollaboratorList title="Desarrolladoras" items={developers} />
        )}
        {publishers.length > 0 && (
          <CollaboratorList title="Publicadoras" items={publishers} />
        )}
      </div>
    </section>
  );
}

function CollaboratorList({
  title,
  items,
}: {
  title: string;
  items: CompanyCollaborator[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={`${item.role}-${item.slug}`} className="flex items-center justify-between gap-3">
            <Link href={`/compania/${item.slug}`} className="text-sm text-accent hover:underline">
              {item.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {item.count.toLocaleString("es-ES")} juegos
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
