import { redirect } from "next/navigation";
import { NotificationInboxClient } from "@/components/notification-inbox-client";
import { SiteNav } from "@/components/site-nav";
import { getUserNotificationInbox } from "@/lib/conversations";
import { getCurrentUser } from "@/lib/users";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notificaciones");

  const { notifications, summary } = await getUserNotificationInbox(user.id, 100);

  return (
    <>
      <SiteNav />
      <NotificationInboxClient
        initialNotifications={notifications}
        initialSummary={summary}
      />
    </>
  );
}
