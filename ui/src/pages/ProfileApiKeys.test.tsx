// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileApiKeys } from "./ProfileApiKeys";

const mockAccessApi = vi.hoisted(() => ({
  listBoardApiKeys: vi.fn(),
  createBoardApiKey: vi.fn(),
  revokeBoardApiKey: vi.fn(),
}));

vi.mock("@/api/access", () => ({
  accessApi: mockAccessApi,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function findButton(text: string) {
  return Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === text);
}

describe("ProfileApiKeys", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockAccessApi.listBoardApiKeys.mockResolvedValue([
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Mission Control",
        createdAt: "2026-10-01T12:00:00.000Z",
        lastUsedAt: "2026-10-07T12:00:00.000Z",
        revokedAt: null,
        expiresAt: "2026-10-31T12:00:00.000Z",
      },
    ]);
    mockAccessApi.createBoardApiKey.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      name: "Homelab deploy",
      token: "pcp_board_plaintext",
      createdAt: "2026-10-07T12:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
      expiresAt: "2026-11-06T12:00:00.000Z",
    });
    mockAccessApi.revokeBoardApiKey.mockResolvedValue({
      ok: true,
      keyId: "55555555-5555-4555-8555-555555555555",
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProfileApiKeys companyId="11111111-1111-4111-8111-111111111111" />
        </QueryClientProvider>,
      );
    });
    await flushReact();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("lists the current user's keys and requests inactive keys on demand", async () => {
    expect(container.textContent).toContain("Mission Control");
    expect(mockAccessApi.listBoardApiKeys).toHaveBeenCalledWith(false);

    const checkbox = container.querySelector("#show-inactive-board-keys") as HTMLButtonElement;
    await act(async () => checkbox.click());
    await flushReact();

    expect(mockAccessApi.listBoardApiKeys).toHaveBeenCalledWith(true);
  });

  it("creates a named key and reveals its plaintext once", async () => {
    const nameInput = container.querySelector("#board-key-name") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Homelab deploy");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => findButton("Create key")?.click());
    await flushReact();

    expect(mockAccessApi.createBoardApiKey).toHaveBeenCalledWith({
      name: "Homelab deploy",
      requestedCompanyId: "11111111-1111-4111-8111-111111111111",
    });
    expect((container.querySelector('input[aria-label="New API key for Homelab deploy"]') as HTMLInputElement).value)
      .toBe("pcp_board_plaintext");
    expect(container.textContent).toContain("This secret is shown once.");
  });

  it("requires confirmation before revoking an active key", async () => {
    await act(async () => findButton("Revoke")?.click());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Revoke Mission Control?");

    await act(async () => findButton("Revoke key")?.click());
    await flushReact();

    expect(mockAccessApi.revokeBoardApiKey).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
