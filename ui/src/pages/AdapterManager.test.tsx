import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdapterInfo } from "@/api/adapters";
import { AdapterRow } from "./AdapterManager";

const capabilities: AdapterInfo["capabilities"] = {
  supportsInstructionsBundle: false,
  supportsSkills: false,
  supportsLocalAgentJwt: false,
  requiresMaterializedRuntimeSkills: false,
  supportsAcp: false,
};

function renderRow(type: string) {
  return renderToStaticMarkup(
    <AdapterRow
      adapter={{
        type,
        label: type,
        source: type === "copilot_local" ? "external" : "builtin",
        modelsCount: 1,
        loaded: true,
        disabled: false,
        capabilities,
      }}
      canRemove={false}
      onToggle={() => {}}
      onRemove={() => {}}
      isToggling={false}
    />,
  );
}

describe("AdapterRow", () => {
  it("shows the registry icon and explicit runtime label for each Copilot mode", () => {
    const local = renderRow("copilot_local");
    const cloud = renderRow("github_copilot_web");

    expect(local).toContain('data-adapter-icon="github-copilot-cli"');
    expect(local).toContain("GitHub Copilot CLI");
    expect(cloud).toContain('data-adapter-icon="github-copilot-cloud"');
    expect(cloud).toContain("GitHub Copilot Cloud");
  });
});
