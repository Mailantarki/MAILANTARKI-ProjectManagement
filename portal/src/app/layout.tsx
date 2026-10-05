import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import "../styles/unified.css";

export const metadata: Metadata = { title: "MAILANTARKI.COM | Technical documentation" };
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // A per-request CSP nonce requires dynamic rendering for every HTML response.
  await connection();
  return <html lang="en" className={inter.variable}><body>{children}</body></html>;
}
