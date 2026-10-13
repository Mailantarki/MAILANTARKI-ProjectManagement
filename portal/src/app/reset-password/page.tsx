import Link from "next/link";
import { redirect } from "next/navigation";
import { copy } from "@/lib/copy";
import { getUserClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./form";

export default async function ResetPasswordPage() {
  const { data: { user } } = await (await getUserClient()).auth.getUser();
  if (!user) redirect("/forgot-password?expired=1");
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link></header>
    <main className="main auth-page"><div className="eyebrow">Account access</div><h1>Choose a new password</h1>
      <p>For {user.email}. Use at least 12 characters.</p>
      <ResetPasswordForm />
    </main></div>;
}
