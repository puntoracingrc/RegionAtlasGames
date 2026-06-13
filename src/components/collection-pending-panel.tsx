import { CollectionGroupedPanel } from "@/components/collection-grouped-panel";
import type { CollectionView } from "@/lib/types";

type Props = {
  items: CollectionView[];
};

export function CollectionPendingPanel({ items }: Props) {
  return <CollectionGroupedPanel variant="pending" items={items} />;
}

export function CollectionOutOfScopePanel({ items }: Props) {
  return <CollectionGroupedPanel variant="outOfScope" items={items} />;
}
