import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminApp } from "@/components/admin/AdminApp";
import { getAdminContext } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Server-side guard: only authenticated admin sessions may load the console. Player sessions are a different cookie/table. */
export default async function AdminPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  return (
    <Suspense>
      <AdminApp />
    </Suspense>
  );
}
