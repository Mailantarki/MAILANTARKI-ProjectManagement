import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
import "../styles/unified.css";
import "../styles/components.css";

export const metadata: Metadata = {
  title: "MAILANTARKI.COM | Technical documentation",
  applicationName: "MAILANTARKI.COM Documents",
  appleWebApp: { capable: true, title: "Documents", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1f3d2e", width: "device-width", initialScale: 1 };
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // A per-request CSP nonce requires dynamic rendering for every HTML response.
  await connection();
  return <html lang="en" className={inter.variable}><body>{children}<Toaster /></body></html>;
}
