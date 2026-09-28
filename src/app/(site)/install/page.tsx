import type { Metadata } from "next";
import { DocPage } from "@/components/account/DocPage";
import { INSTALL_GUIDE } from "@/content/install-guide";

export const metadata: Metadata = { title: "Installation Guide", robots: { index: false } };

export default function InstallPage() {
  return <DocPage active="install" title="Download & Install" subtitle="Full source code package and the live deployment guide." markdown={INSTALL_GUIDE} />;
}
