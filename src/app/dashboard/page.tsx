import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <DashboardClient user={user} />;
}
