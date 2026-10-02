"use client";

import { AggregatorSection } from "./AggregatorSection";
import { IntegrationsSection } from "./IntegrationsSection";

export function GameApiManagement() {
  return <div className="space-y-5">
    <AggregatorSection />
    <IntegrationsSection kind="game" />
  </div>;
}
