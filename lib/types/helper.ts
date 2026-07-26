export type HelperStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "removed";
export type HelperVerificationStatus = "unverified" | "verified";

export interface Helper {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  appearance: "emoji" | "logo";
  logoUrl?: string;
  whenToUse: string;
  instructions: string;
  authorId: string;
  authorName: string;
  status: HelperStatus;
  rejectionReason?: string;
  verificationStatus: HelperVerificationStatus;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserHelper {
  helperId: string;
  autoUse: boolean;
  addedAt: string;
}

export interface HelperOverview {
  helpers: Helper[];
  addedHelperIds: string[];
  ownedHelperIds: string[];
}

export const MAX_HELPER_TITLE_LENGTH = 60;
export const MAX_HELPER_WHEN_TO_USE_LENGTH = 200;
export const MAX_HELPER_INSTRUCTIONS_LENGTH = 12_000;
