import { redirect } from "next/navigation";
import { MyListingsClient } from "@/components/my-listings-client";
import { getSellerListings } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listings = (await getSellerListings(user.id)).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return <MyListingsClient listings={listings} />;
}
