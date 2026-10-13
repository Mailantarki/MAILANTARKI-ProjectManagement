import { copy } from "../../lib/copy";
import { safeNext } from "../../lib/auth/next-path";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "./login-form";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  return <AuthLayout eyebrow="Account access" title={copy.signIn} lead="Use the email and password of your portal account.">
    <LoginForm next={next} />
  </AuthLayout>;
}
