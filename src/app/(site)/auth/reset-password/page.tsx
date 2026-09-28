import { Suspense } from "react";
import { AuthActionCard } from "@/components/account/AuthActionCard";

export const metadata = { title: "Reset password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthActionCard kind="reset" />
    </Suspense>
  );
}
