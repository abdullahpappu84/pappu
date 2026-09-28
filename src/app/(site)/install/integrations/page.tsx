import type { Metadata } from "next";
import { DocPage } from "@/components/account/DocPage";
import { INTEGRATION_GUIDE } from "@/content/integration-guide";

export const metadata: Metadata = { title: "Add Any Payment Gateway or Game API", robots: { index: false } };

export default function IntegrationGuidePage() {
  return <DocPage active="integrations" title="যেকোনো Gateway ও Game API যোগ করার নোট" subtitle="Admin panel থেকে code ছাড়াই নতুন payment gateway আর game provider যুক্ত করুন — ধাপে ধাপে।" markdown={INTEGRATION_GUIDE} />;
}
