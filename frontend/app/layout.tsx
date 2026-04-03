import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Capsule",
  description: "Personal AI intake layer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#f7f5f0] min-h-screen">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
