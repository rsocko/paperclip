import { describe, expect, it } from "vitest";

import { GithubIcon } from "@/components/icons/github-icon";
import { getAdapterDisplay, getAdapterLabel, getAdapterLabels } from "./adapter-display-registry";

describe("adapter display registry", () => {
  it("uses user-facing labels without the legacy local qualifier for built-in adapters", () => {
    expect(getAdapterLabel("codex_local")).toBe("Codex");
    expect(getAdapterLabel("copilot_local")).toBe("GitHub Copilot");
    expect(getAdapterLabel("claude_local")).toBe("Claude Code");
    expect(getAdapterLabel("acpx_local")).toBe("ACPX (retired)");
    expect(getAdapterLabel("cursor")).toBe("Cursor");
    expect(getAdapterLabel("gemini_local")).toBe("Gemini CLI");
    expect(getAdapterLabel("grok_local")).toBe("Grok Build");
    expect(getAdapterLabel("kimi_local")).toBe("Kimi Code");
    expect(getAdapterLabel("hermes_local")).toBe("Hermes");
    expect(getAdapterLabel("hermes_gateway")).toBe("Hermes Gateway");
    expect(getAdapterLabel("opencode_local")).toBe("OpenCode");
    expect(getAdapterLabel("pi_local")).toBe("Pi");

    expect(getAdapterLabels()).toMatchObject({
      codex_local: "Codex",
      copilot_local: "GitHub Copilot",
      claude_local: "Claude Code",
      acpx_local: "ACPX (retired)",
      cursor: "Cursor",
      gemini_local: "Gemini CLI",
      grok_local: "Grok Build",
      kimi_local: "Kimi Code",
      hermes_local: "Hermes",
      hermes_gateway: "Hermes Gateway",
      opencode_local: "OpenCode",
      pi_local: "Pi",
    });
  });

  it("uses the GitHub mark for the local Copilot adapter", () => {
    expect(getAdapterDisplay("copilot_local")).toMatchObject({
      label: "GitHub Copilot",
      description: "GitHub Copilot CLI harness",
      icon: GithubIcon,
    });
  });

  it("drops local suffixes for unknown plugin adapter labels", () => {
    expect(getAdapterLabel("droid_local")).toBe("Droid");
    expect(getAdapterDisplay("droid_local")).toMatchObject({
      label: "Droid",
      description: "External adapter",
    });
  });

  it("keeps a gateway suffix for unknown plugin adapter labels", () => {
    expect(getAdapterLabel("droid_gateway")).toBe("Droid (gateway)");
    expect(getAdapterDisplay("droid_gateway")).toMatchObject({
      label: "Droid (gateway)",
      description: "External gateway adapter",
    });
  });
});
