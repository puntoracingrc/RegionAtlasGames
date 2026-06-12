import { redirect } from "next/navigation";
import { ChatClient } from "@/components/chat-client";
import { canUseMarketplace } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

type Props = { params: Promise<{ id: string }> };

export default async function ChatPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canUseMarketplace(user.plan)) redirect("/ajustes");

  const { id } = await params;
  return <ChatClient conversationId={id} userId={user.id} />;
}
