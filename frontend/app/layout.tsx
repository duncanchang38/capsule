import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/ToastProvider";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: "Capsule",
  description: "Personal AI intake layer",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#f7f5f0] min-h-screen">
        <SessionProvider>
          <ToastProvider>
            <Nav />
            <main>{children}</main>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
