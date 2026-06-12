/** Contorno épicos en tarjetas y ficha (rareza / top / en colección). */
export function coverHighlightClass(
  owned: boolean,
  grail: boolean,
  topSegment: boolean,
): string {
  if (owned && (grail || topSegment)) {
    return "card-glow card-glow-owned-legendary";
  }
  if (owned) {
    return "card-glow card-glow-owned";
  }
  if (grail && topSegment) {
    return "card-glow card-glow-legendary";
  }
  if (grail) {
    return "card-glow card-glow-grail";
  }
  if (topSegment) {
    return "card-glow card-glow-top";
  }
  return "";
}

export function gameCardHighlightClass(
  owned: boolean,
  grail: boolean,
  topSegment: boolean,
): string {
  return coverHighlightClass(owned, grail, topSegment) || "border-border hover:border-accent/30";
}
