import { redirect } from "next/navigation";
import { getUserClient } from "@/lib/supabase/server";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordForm } from "./form";
import { signOut } from "@/app/projects/sign-out";

export default async function ChangePasswordPage() {
  const client = await getUserClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("suspended_at,must_change_password").eq("id", user.id).maybeSingle();
  if (!profile || profile.suspended_at) redirect("/login");
  if (!profile.must_change_password) redirect("/projects");
  return <AuthLayout eyebrow="First sign-in" title="Choose your password"
    lead="Your administrator created this account with a temporary password. Choose your own to continue.">
    <PasswordForm />
    <form action={signOut} className="auth-back"><button className="auth-text-button">Sign out</button></form>
  </AuthLayout>;
}
