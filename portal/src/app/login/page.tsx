import Link from "next/link";
import { copy } from "../../lib/copy";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link></header>
    <main className="main"><div className="eyebrow">Account access</div><h1>{copy.signIn}</h1><LoginForm /></main></div>;
}
