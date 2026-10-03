// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeTestCard } from "./RuntimeTestCard";

describe("RuntimeTestCard", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("keeps each actionable validation issue visible in the failed state", async () => {
    await act(async () => {
      root.render(
        <RuntimeTestCard
          state="fail"
          result={null}
          error={"testCredentials.GITHUB_TOKEN: Must contain at most 16384 characters\nadapterConfig.baseRef: Expected string"}
          onTest={vi.fn()}
        />,
      );
    });

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain(
      "testCredentials.GITHUB_TOKEN: Must contain at most 16384 characters",
    );
    expect(host.textContent).toContain("adapterConfig.baseRef: Expected string");
    expect(host.textContent).not.toContain("Check your model and provider connection");
  });
});
