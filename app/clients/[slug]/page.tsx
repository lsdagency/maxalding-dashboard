import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listClients } from "@/lib/repo";
import { slugify } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import ClientDetailClient from "./ClientDetailClient";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { slug } = await params;
  const clients = await listClients();
  const client = clients.find((c) => slugify(c.name) === slug);
  if (!client) notFound();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader name={session.name} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <ClientDetailClient clientId={client.id} />
      </main>
    </div>
  );
}
