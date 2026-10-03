import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GitHubCopilotCliIcon,
  GitHubCopilotCloudIcon,
} from "./CopilotAdapterIcon";

describe("Copilot adapter mode icons", () => {
  it("renders a decorative terminal badge for the local CLI runtime", () => {
    const markup = renderToStaticMarkup(<GitHubCopilotCliIcon className="size-6" />);

    expect(markup).toContain('data-adapter-icon="github-copilot-cli"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('fill="var(--adapter-copilot-anchor)"');
    expect(markup).toContain("<rect");
    expect(markup).toContain("var(--adapter-copilot-prompt)");
    expect(markup).not.toContain("cloud");
  });

  it("renders a free-standing cloud glyph for the hosted runtime", () => {
    const markup = renderToStaticMarkup(<GitHubCopilotCloudIcon className="size-6" />);

    expect(markup).toContain('data-adapter-icon="github-copilot-cloud"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('fill="var(--adapter-copilot-anchor)"');
    expect(markup).toContain("var(--adapter-copilot-cloud-accent)");
    expect(markup).not.toContain("<rect");
  });
});
