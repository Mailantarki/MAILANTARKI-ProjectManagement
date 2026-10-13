import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "./form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return <AuthLayout eyebrow="Account access" title="Reset your password"
    lead={<>Enter the email you use to sign in. We&apos;ll send you a link to choose a new password.</>}>
    {expired && <p className="form-alert auth-notice" role="alert">That link has expired or was already used. Request a new one below.</p>}
    <ForgotPasswordForm />
    <p className="auth-back"><Link href="/login"><ArrowLeft size={16} aria-hidden />Back to sign in</Link></p>
  </AuthLayout>;
}
