import { redirect } from "next/navigation";
import { getUserClient } from "@/lib/supabase/server";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetPasswordForm } from "./form";

export default async function ResetPasswordPage() {
  const { data: { user } } = await (await getUserClient()).auth.getUser();
  if (!user) redirect("/forgot-password?expired=1");
  return <AuthLayout eyebrow="Account access" title="Choose a new password" lead={<>For <strong>{user.email}</strong>. Use at least 12 characters.</>}>
    <ResetPasswordForm />
  </AuthLayout>;
}
