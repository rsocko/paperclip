import { describe, expect, it } from "vitest";
import { taskAdapterConfigOverrides } from "./issue-assignee-adapter-overrides.js";

describe("taskAdapterConfigOverrides", () => {
  it("maps Copilot task settings to model and reasoningEffort only", () => {
    expect(
      taskAdapterConfigOverrides("copilot_local", {
        model: "claude-sonnet-5",
        reasoningEffort: "xhigh",
        modelReasoningEffort: "wrong-key",
        env: { COPILOT_GITHUB_TOKEN: "secret" },
        permissionMode: "bypass",
        timeoutSeconds: 1,
        mode: "stdio",
      }),
    ).toEqual({
      model: "claude-sonnet-5",
      reasoningEffort: "xhigh",
    });
  });

  it.each([
    ["claude_local", { model: "claude-sonnet-5", effort: "high" }],
    ["codex_local", { model: "gpt-6-astra", modelReasoningEffort: "ultra" }],
    ["opencode_local", { model: "openai/gpt-5.4", variant: "high" }],
  ])("keeps the established %s task keys", (adapterType, expected) => {
    expect(taskAdapterConfigOverrides(adapterType, {
      ...expected,
      reasoningEffort: "not-universally-allowed",
      extraArgs: ["--unsafe"],
    })).toEqual(expected);
  });

  it("returns null for unsupported adapters and empty values", () => {
    expect(taskAdapterConfigOverrides("process", { model: "anything" })).toBeNull();
    expect(taskAdapterConfigOverrides("copilot_local", { model: " " })).toBeNull();
  });
});
