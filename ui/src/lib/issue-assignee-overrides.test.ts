// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildAssigneeAdapterOverrides } from "./issue-assignee-overrides";

describe("buildAssigneeAdapterOverrides", () => {
  it("returns null for adapters that do not accept issue overrides", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "process",
        lane: "custom",
        modelOverride: "anything",
        thinkingEffortOverride: "high",
      }),
    ).toBeNull();
  });

  it("primary lane sends nothing", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "claude_local",
        lane: "primary",
        modelOverride: "",
        thinkingEffortOverride: "",
      }),
    ).toBeNull();
  });

  it("custom lane preserves explicit model and thinking effort overrides", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "claude_local",
        lane: "custom",
        modelOverride: "claude-haiku-4-5",
        thinkingEffortOverride: "high",
      }),
    ).toEqual({
      adapterConfig: {
        model: "claude-haiku-4-5",
        effort: "high",
      },
    });
  });

  it("custom lane returns null when no fields are set", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "codex_local",
        lane: "custom",
        modelOverride: "",
        thinkingEffortOverride: "",
      }),
    ).toBeNull();
  });

  it("custom lane uses adapter-specific keys for thinking effort", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "codex_local",
        lane: "custom",
        modelOverride: "",
        thinkingEffortOverride: "minimal",
      }),
    ).toEqual({
      adapterConfig: { modelReasoningEffort: "minimal" },
    });
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "opencode_local",
        lane: "custom",
        modelOverride: "",
        thinkingEffortOverride: "max",
      }),
    ).toEqual({
      adapterConfig: { variant: "max" },
    });
  });

  it("uses the Copilot adapter runtime key for thinking effort", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "copilot_local",
        lane: "custom",
        modelOverride: "claude-sonnet-5",
        thinkingEffortOverride: "xhigh",
      }),
    ).toEqual({
      adapterConfig: {
        model: "claude-sonnet-5",
        reasoningEffort: "xhigh",
      },
    });
  });

  it("persists an exact GPT-6 Astra task override", () => {
    expect(
      buildAssigneeAdapterOverrides({
        adapterType: "codex_local",
        lane: "custom",
        modelOverride: "gpt-6-astra",
        thinkingEffortOverride: "ultra",
      }),
    ).toEqual({
      adapterConfig: {
        model: "gpt-6-astra",
        modelReasoningEffort: "ultra",
      },
    });
  });
});
