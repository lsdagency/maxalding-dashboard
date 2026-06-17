import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader name={session.name} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <DashboardClient />
      </main>
    </div>
  );
}
