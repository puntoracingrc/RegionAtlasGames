export const COLLECTION_CHANGED_EVENT = "regionatlas:collection-changed";

export function notifyCollectionChanged() {
  window.dispatchEvent(new Event(COLLECTION_CHANGED_EVENT));
}
