import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 p-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-[0.2em] text-foreground">MAXALDING</h1>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Performance Dashboard</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
