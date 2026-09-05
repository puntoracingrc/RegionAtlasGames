import Link from "next/link";
import type { EntityRelationshipDisplay } from "@/lib/franchise-system";

export function EntityRelationshipsPanel({
  relationships,
}: {
  relationships: EntityRelationshipDisplay[];
}) {
  if (relationships.length === 0) return null;

  return (
    <section className="mb-8 border-y border-border py-5">
      <h2 className="text-lg font-semibold text-foreground">Relaciones</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {relationships.map((relationship) => (
          <div key={relationship.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2">
            <dt className="text-sm text-muted">{relationship.label}</dt>
            <dd>
              <Link href={relationship.href} className="font-semibold text-accent hover:underline">
                {relationship.entityName}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
