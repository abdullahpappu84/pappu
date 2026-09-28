import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminApp } from "@/components/admin/AdminApp";
import { getAdminContext } from "@/lib/server/auth";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

/** Server-side guard: only authenticated admin sessions may load the console. Player sessions are a different cookie/table. */
export default async function AdminPage() {
  await ensureSeeded();
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  return (
    <Suspense>
      <AdminApp />
    </Suspense>
  );
}
