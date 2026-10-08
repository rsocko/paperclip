// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CostByProviderModel } from "@paperclipai/shared";
import { ProviderQuotaCard } from "./ProviderQuotaCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("ProviderQuotaCard token accounting", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows cached input separately and identifies provider-omitted usage", () => {
    const rows: CostByProviderModel[] = [
      {
        provider: "github_copilot",
        biller: "github",
        billingType: "subscription_included",
        model: "claude-sonnet",
        costCents: 0,
        inputTokens: 1_000,
        cachedInputTokens: 2_000,
        outputTokens: 300,
        apiRunCount: 0,
        subscriptionRunCount: 1,
        subscriptionInputTokens: 1_000,
        subscriptionCachedInputTokens: 2_000,
        subscriptionOutputTokens: 300,
        usageReportedEventCount: 1,
        usageUnavailableEventCount: 1,
      },
    ];

    act(() => {
      root.render(
        <ProviderQuotaCard
          provider="github_copilot"
          rows={rows}
          budgetMonthlyCents={0}
          totalCompanySpendCents={0}
          weekSpendCents={0}
          windowRows={[]}
          showDeficitNotch={false}
        />,
      );
    });

    expect(container.textContent).toContain("1.0k in");
    expect(container.textContent).toContain("2.0k cached");
    expect(container.textContent).toContain("300 out");
    expect(container.textContent).toContain(
      "Token usage unavailable for 1 event because the provider omitted it.",
    );
  });
});
