import visuals from "../../data/award-recipient-visuals.json";
import type { AwardRecipientRef } from "./award-research-types";

type RecipientVisual = {
  displayName: string;
  imagePath: string;
  format: string;
  officialUrl: string;
};

export function getAwardRecipientVisual(recipient: AwardRecipientRef, resultId?: string, recipientIndex = 0): RecipientVisual | undefined {
  if (recipient.type !== "game" || recipient.workKey || !resultId) return undefined;
  // Explicit result and recipient identity, never a title-based catalog match.
  const visual = (visuals as Record<string, RecipientVisual>)[`${resultId}:${recipientIndex}`];
  if (!visual || visual.displayName !== recipient.displayName || !visual.imagePath.startsWith("/award-game-art/")) return undefined;
  return visual;
}
