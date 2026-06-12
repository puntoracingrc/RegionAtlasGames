import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyGameRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/coleccion/${id}`);
}
