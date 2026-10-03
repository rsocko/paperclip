import { describe, expect, it } from "vitest";
import { isAiConnectionCompatible } from "@paperclipai/shared";
import { taskAdapterConfigOverrides } from "../services/issue-assignee-adapter-overrides.js";
import { validateAdapterModule } from "./plugin-loader.js";
import { requireServerAdapter } from "./registry.js";

describe("Codex and Copilot adapter coexistence", () => {
  it("discovers all three runtimes without an adapter type collision", () => {
    const codex = requireServerAdapter("codex_local");
    const cloudCopilot = requireServerAdapter("github_copilot_web");
    const localCopilot = validateAdapterModule(
      {
        createServerAdapter: () => ({
          type: "copilot_local",
          execute: async () => ({
            exitCode: 0,
            signal: null,
            timedOut: false,
          }),
          testEnvironment: async () => ({
            adapterType: "copilot_local",
            status: "pass" as const,
            checks: [],
            testedAt: new Date(0).toISOString(),
          }),
        }),
      },
      "/opt/paperclip/adapters/copilot-local",
    );

    expect(new Set([codex.type, localCopilot.type, cloudCopilot.type])).toEqual(
      new Set(["codex_local", "copilot_local", "github_copilot_web"]),
    );
    expect(codex.execute).not.toBe(localCopilot.execute);
    expect(localCopilot.execute).not.toBe(cloudCopilot.execute);
  });

  it("routes OpenAI credentials only to Codex", () => {
    const openAiApiKey = {
      provider: "openai" as const,
      method: "api_key" as const,
    };

    expect(isAiConnectionCompatible(openAiApiKey, "codex_local")).toBe(true);
    expect(isAiConnectionCompatible(openAiApiKey, "copilot_local")).toBe(false);
    expect(isAiConnectionCompatible(openAiApiKey, "github_copilot_web")).toBe(false);
  });

  it("keeps task model overrides specific to each runtime", () => {
    const requested = {
      model: "gpt-5.4",
      modelReasoningEffort: "high",
      reasoningEffort: "xhigh",
    };

    expect(taskAdapterConfigOverrides("codex_local", requested)).toEqual({
      model: "gpt-5.4",
      modelReasoningEffort: "high",
    });
    expect(taskAdapterConfigOverrides("copilot_local", requested)).toEqual({
      model: "gpt-5.4",
      reasoningEffort: "xhigh",
    });
    expect(taskAdapterConfigOverrides("github_copilot_web", requested)).toBeNull();
  });
});
