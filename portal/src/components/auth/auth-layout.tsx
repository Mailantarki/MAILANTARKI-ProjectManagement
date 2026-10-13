import Image from "next/image";
import Link from "next/link";
import { Cinzel } from "next/font/google";
import { copy } from "@/lib/copy";
import hero from "./hero.jpg";

// Display face shared with the public landing. next/font self-hosts it, so the CSP (font-src 'self') holds.
const display = Cinzel({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--font-display" });

type Props = {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
};

/** Split layout for every signed-out page: brand image on one side, the form on the other. */
export function AuthLayout({ eyebrow, title, lead, children }: Props) {
  return <div className={`auth ${display.variable}`}>
    <section className="auth-visual">
      <Image className="auth-visual-image" src={hero} alt="" fill priority placeholder="blur"
        sizes="(max-width: 959px) 100vw, 56vw" />
      <div className="auth-visual-top">
        <Link className="auth-wordmark" href="/">{copy.brand}</Link>
        <span className="auth-kicker">{copy.portalName}</span>
      </div>
      <div className="auth-visual-bottom">
        <p className="auth-statement">{copy.authStatement}</p>
        <ul className="auth-disciplines" aria-label="Disciplines">
          {copy.authDisciplines.map((name) => <li key={name}>{name}</li>)}
        </ul>
        <p className="auth-caption">{copy.authCaption}</p>
      </div>
    </section>
    <main className="auth-panel">
      <div className="auth-card">
        <p className="auth-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p className="auth-lead">{lead}</p>}
        {children}
      </div>
      <footer className="auth-footer">
        <span>{copy.authHelp}</span>
        <a href={copy.landingUrl}>{copy.landingLabel}</a>
      </footer>
    </main>
  </div>;
}
