export type UserPlan = "free" | "pro";

export type ListingStatus = "draft" | "active" | "sold" | "cancelled";

export type ListingPhotoSlot =
  | "cover-front"
  | "cover-back"
  | "media-front"
  | "media-back"
  | "manual-front";

export type ListingPhoto = {
  slot: ListingPhotoSlot;
  url: string;
  width: number;
  height: number;
  bytes: number;
  uploadedAt: string;
};

export type AiListingAnalysis = {
  conditionVerdict: string;
  conditionScore: number;
  estimatedPriceEur: number;
  notes: string;
  analyzedAt: string;
  model: string;
};

export type MarketplaceListing = {
  id: string;
  catalogId: string;
  sellerId: string;
  sellerName: string;
  collectionItemId: string;
  title: string;
  platformSlug: string;
  region: string;
  status: ListingStatus;
  photos: ListingPhoto[];
  aiAnalysis: AiListingAnalysis | null;
  sealed: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  soldToUserId: string | null;
  soldToUserName: string | null;
  sellerConfirmedAt: string | null;
  buyerConfirmedAt: string | null;
  recordedSalePriceEur: number | null;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
};

export type RecordedPrivateSale = {
  id: string;
  catalogId: string;
  priceEur: number;
  conditionScore: number | null;
  sealed: boolean;
  completedAt: string;
};

export const REQUIRED_PHOTO_SLOTS: ListingPhotoSlot[] = [
  "cover-front",
  "cover-back",
  "media-front",
  "media-back",
];

export const OPTIONAL_PHOTO_SLOTS: ListingPhotoSlot[] = ["manual-front"];

export const PHOTO_SLOT_LABELS: Record<ListingPhotoSlot, string> = {
  "cover-front": "Portada (anverso)",
  "cover-back": "Portada (reverso)",
  "media-front": "Cartucho / disco (anverso)",
  "media-back": "Cartucho / disco (reverso)",
  "manual-front": "Manual (portada, si incluye)",
};
