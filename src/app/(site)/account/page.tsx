import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountDashboard } from "@/components/account/AccountDashboard";

export const metadata: Metadata = { title: "My Account", robots: { index: false } };

export default function AccountPage() {
  return (
    <Suspense>
      <AccountDashboard />
    </Suspense>
  );
}
