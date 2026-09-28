import type { Metadata } from "next";
import { DocPage } from "@/components/account/DocPage";
import { PAYMENT_GATEWAY_GUIDE } from "@/content/payment-gateway-guide";

export const metadata: Metadata = { title: "Payment Gateway Setup", robots: { index: false } };

export default function PaymentGatewayGuidePage() {
  return <DocPage active="payments" title="Payment Gateway সেটআপ" subtitle="Stripe, SSLCommerz, bKash, Crypto আর Custom gateway — শুধু .env-এ key বসিয়ে চালু করুন।" markdown={PAYMENT_GATEWAY_GUIDE} />;
}
