import { redirect } from "next/navigation";
import { MessagesInboxClient } from "@/components/messages-inbox-client";
import { getUserConversations } from "@/lib/conversations";
import { getListing } from "@/lib/listings";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canUseMarketplace(user.plan)) redirect("/ajustes");

  const conversations = getUserConversations(user.id).map((conv) => {
    const listing = getListing(conv.listingId);
    const last = conv.messages[conv.messages.length - 1];
    const role = conv.sellerId === user.id ? ("seller" as const) : ("buyer" as const);
    const peerName = role === "seller" ? conv.buyerName : conv.sellerName;

    return {
      id: conv.id,
      listingId: conv.listingId,
      catalogId: conv.catalogId,
      title: listing?.title ?? "Anuncio",
      listingStatus: listing?.status ?? null,
      role,
      peerName,
      messageCount: conv.messages.length,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.createdAt ?? conv.updatedAt,
      updatedAt: conv.updatedAt,
    };
  });

  return <MessagesInboxClient conversations={conversations} />;
}
