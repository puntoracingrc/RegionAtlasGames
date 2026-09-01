import { redirect } from "next/navigation";

export default function RegisterPage() {
  redirect("/login?next=%2Fajustes");
}
