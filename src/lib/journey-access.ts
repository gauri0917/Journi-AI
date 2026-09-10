import { roleMatches } from "@/lib/deal-run";

type JourneyLike = { status: string; createdBy: string };
type ReviewLike = { reviewerRole: string };

// Single source of truth for "who can see this journey" — used by the
// dashboard listing, the list API, the detail page, and the single-journey
// API, so the rule can't drift between them.
//
// - draft: creator only.
// - in_review: creator, or anyone whose profile role matches one of the
//   assigned reviewer roles (so the review workflow keeps working) — NOT
//   just anyone, since "reviewed but not released" is still private to the
//   creator and the specific people reviewing it.
// - published / archived: visible to everyone (the org-wide record).
export function canViewJourney(
  journey: JourneyLike,
  reviews: ReviewLike[],
  viewerName: string,
  viewerRole: string | null
): boolean {
  if (journey.status === "published" || journey.status === "archived") return true;
  if (journey.createdBy === viewerName) return true;
  if (journey.status === "in_review") {
    return reviews.some((r) => roleMatches(viewerRole, r.reviewerRole));
  }
  return false;
}
