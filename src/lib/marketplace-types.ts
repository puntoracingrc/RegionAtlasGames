import type { CollectionCondition } from "./types";

export type UserPlan = "free" | "pro";

export type ListingStatus = "draft" | "active" | "sold" | "cancelled";

export type ListingPhotoSlot =
  | "cover-front"
  | "cover-back"
  | "media-front"
  | "media-back"
  | "manual-front"
  | "detail-1"
  | "detail-2"
  | "detail-3";

export type ListingPhoto = {
  slot: ListingPhotoSlot;
  url: string;
  width: number;
  height: number;
  bytes: number;
  contentHash?: string;
  perceptualHash?: string;
  uploadedAt: string;
};

export type ListingVerificationStatus =
  | "verified"
  | "manual_verified"
  | "review_required"
  | "unavailable"
  | "rejected";

export type AiListingAnalysis = {
  conditionVerdict: string;
  conditionScore: number;
  estimatedPriceEur: number;
  visualDescription?: string;
  gameMatchVerdict?: string;
  gameMatchConfidence?: number;
  conditionIssues?: string[];
  verificationStatus?: ListingVerificationStatus;
  verificationReasons?: string[];
  analyzedPhotoSlots?: ListingPhotoSlot[];
  uniquePhotoCount?: number;
  regionVerdict?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  manualReviewCriteria?: ManualListingReviewCriterion[];
  notes: string;
  analyzedAt: string;
  model: string;
};

export const MANUAL_LISTING_REVIEW_CRITERIA = [
  "distinct_photos",
  "game_and_platform",
  "region_evidence",
] as const;

export type ManualListingReviewCriterion =
  (typeof MANUAL_LISTING_REVIEW_CRITERIA)[number];

export type ListingSaleOptions = {
  pickup: boolean;
  shipping: boolean;
};

export type ApproximateListingLocation = {
  latitude: number;
  longitude: number;
  precision: "approximate";
};

export type MarketplaceListing = {
  id: string;
  catalogId: string;
  sellerId: string;
  sellerName: string;
  sellerCity: string | null;
  collectionItemId: string;
  title: string;
  customTitle: string | null;
  customDescription: string | null;
  saleOptions: ListingSaleOptions;
  askingPriceEur?: number | null;
  sellerLocation?: ApproximateListingLocation | null;
  platformSlug: string;
  region: string;
  status: ListingStatus;
  photos: ListingPhoto[];
  aiAnalysis: AiListingAnalysis | null;
  sealed: boolean;
  collectionCondition?: CollectionCondition;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  soldToUserId: string | null;
  soldToUserName: string | null;
  sellerConfirmedAt: string | null;
  buyerConfirmedAt: string | null;
  recordedSalePriceEur: number | null;
};

export type MarketplaceListingClientPhoto = Omit<
  ListingPhoto,
  "contentHash" | "perceptualHash"
>;

export type MarketplaceListingClientView = Pick<
  MarketplaceListing,
  | "id"
  | "catalogId"
  | "sellerName"
  | "sellerCity"
  | "title"
  | "customTitle"
  | "customDescription"
  | "saleOptions"
  | "askingPriceEur"
  | "sellerLocation"
  | "platformSlug"
  | "region"
  | "status"
  | "aiAnalysis"
  | "sealed"
  | "collectionCondition"
  | "updatedAt"
  | "publishedAt"
  | "sellerConfirmedAt"
  | "buyerConfirmedAt"
  | "recordedSalePriceEur"
> & {
  photos: MarketplaceListingClientPhoto[];
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  status?: "sent" | "delivered" | "read";
};

export type MarketplaceConversation = {
  id: string;
  listingId: string;
  catalogId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  messages: ChatMessage[];
  blockedByUserIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceBlock = {
  id: string;
  blockerId: string;
  blockedId: string;
  conversationId: string;
  createdAt: string;
};

export type MarketplaceNotificationKind =
  | "new_message"
  | "listing_approved"
  | "listing_rejected"
  | "sale_marked"
  | "sale_completed";

export type MarketplaceNotification = {
  id: string;
  recipientId: string;
  kind: MarketplaceNotificationKind;
  title: string;
  body: string | null;
  href: string;
  eventKey: string;
  actorId: string | null;
  conversationId: string | null;
  listingId: string | null;
  catalogId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type MarketplaceCommunicationSummary = {
  unreadNotifications: number;
  unreadMessages: number;
};

export type RecordedPrivateSale = {
  id: string;
  catalogId: string;
  priceEur: number;
  conditionScore: number | null;
  sealed: boolean;
  collectionCondition?: CollectionCondition;
  completedAt: string;
};

export const REQUIRED_PHOTO_SLOTS: ListingPhotoSlot[] = [
  "cover-front",
  "cover-back",
];

export const OPTIONAL_PHOTO_SLOTS: ListingPhotoSlot[] = [
  "media-front",
  "media-back",
  "manual-front",
  "detail-1",
  "detail-2",
  "detail-3",
];

export const PHOTO_SLOT_LABELS: Record<ListingPhotoSlot, string> = {
  "cover-front": "Portada",
  "cover-back": "Contraportada",
  "media-front": "Cartucho / disco (anverso)",
  "media-back": "Cartucho / disco (reverso)",
  "manual-front": "Manual (portada, si incluye)",
  "detail-1": "Detalle adicional 1",
  "detail-2": "Detalle adicional 2",
  "detail-3": "Detalle adicional 3",
};
