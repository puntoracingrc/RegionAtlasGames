import { getCurrentUser } from "./users";
import { isAdminEmail } from "./admin-auth";
import { isContributorEmail } from "./admin-contributors";
import type { AdminGameDraft, ContributorReviewStatus } from "./admin-draft-types";
import type { CatalogStagingGame } from "./catalog-staging-types";
import { readAdminGameDraft } from "./admin-draft-storage";
import { readCatalogStagingGame } from "./catalog-staging-storage";

export type StaffRole = "admin" | "contributor" | null;

export async function getStaffRole(email: string | null | undefined): Promise<StaffRole> {
  if (!email) return null;
  if (isAdminEmail(email)) return "admin";
  if (await isContributorEmail(email)) return "contributor";
  return null;
}

export async function assertContributorApi(): Promise<{ email: string; id: string } | null> {
  const user = await getCurrentUser();
  if (!user || !(await isContributorEmail(user.email)) || isAdminEmail(user.email)) {
    return null;
  }
  return { email: user.email.trim().toLowerCase(), id: user.id };
}

export function contributorCanEditReviewStatus(status: ContributorReviewStatus | null | undefined) {
  return status == null || status === "contributor-draft";
}

export async function loadContributorStagingEntry(
  pcId: number,
  contributorEmail: string,
): Promise<
  | { staging: CatalogStagingGame; draft: AdminGameDraft | null }
  | { error: string; status: number }
> {
  const staging = await readCatalogStagingGame(pcId);
  if (!staging) {
    return { error: "Ficha no encontrada.", status: 404 };
  }

  const owner = staging.contributorEmail?.trim().toLowerCase();
  if (!owner || owner !== contributorEmail.trim().toLowerCase()) {
    return { error: "No tienes acceso a esta ficha.", status: 403 };
  }

  const draft = await readAdminGameDraft(pcId);
  return { staging, draft };
}

export function isContributorSubmission(staging: CatalogStagingGame): boolean {
  return Boolean(staging.contributorEmail && staging.reviewStatus === "pending-review");
}
