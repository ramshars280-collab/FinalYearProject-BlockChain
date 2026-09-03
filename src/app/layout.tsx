import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "SOET VeriTrust | Blockchain Degree Verification",
  description:
    "OpenCerts/Blockcerts-compliant academic credential authentication system with EIP-712 identity binding, dynamic revocation bitmaps, and NEP 2020 Academic Bank of Credits.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 shadow-2xs">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p>
                &copy; {new Date().getFullYear()} MGM University Examination Authority &bull; Powered by Ethereum Sepolia
              </p>
              <p className="font-mono text-[11px] text-blue-800 font-semibold">
                EIP-712 &bull; O(1) Dynamic Bitmap &bull; NEP 2020 ABC &bull; India DPDP Act
              </p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
