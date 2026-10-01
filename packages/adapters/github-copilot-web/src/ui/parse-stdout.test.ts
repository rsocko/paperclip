import { describe, expect, it } from "vitest";
import { parseGitHubCopilotWebStdoutLine } from "./parse-stdout.js";

describe("parseGitHubCopilotWebStdoutLine", () => {
  it("maps initialization, progress, and terminal events", () => {
    const ts = "2026-10-01T00:00:00.000Z";
    expect(parseGitHubCopilotWebStdoutLine(
      JSON.stringify({ type: "github_copilot_web.init", taskId: "task-1", model: "gpt-5.4" }),
      ts,
    )[0]).toMatchObject({ kind: "init", sessionId: "task-1", model: "gpt-5.4" });
    expect(parseGitHubCopilotWebStdoutLine(
      JSON.stringify({ type: "github_copilot_web.status", state: "in_progress", message: "Working" }),
      ts,
    )[0]).toMatchObject({ kind: "system", text: "in_progress: Working" });
    expect(parseGitHubCopilotWebStdoutLine(
      JSON.stringify({ type: "github_copilot_web.result", state: "failed", error: "No access" }),
      ts,
    )[0]).toMatchObject({ kind: "result", subtype: "failed", isError: true, errors: ["No access"] });
  });
});
