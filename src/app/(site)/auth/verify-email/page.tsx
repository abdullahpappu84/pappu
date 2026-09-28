import { Suspense } from "react";
import { AuthActionCard } from "@/components/account/AuthActionCard";

export const metadata = { title: "Verify email", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <AuthActionCard kind="verify" />
    </Suspense>
  );
}
