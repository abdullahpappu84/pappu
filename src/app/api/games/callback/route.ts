import { handleAggregatorCallback } from "@/lib/server/aggregator-callback";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAggregatorCallback(request);
}
