import { describe, expect, it } from "vitest";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { buildGitHubCopilotWebConfig } from "./build-config.js";
import { getConfigSchema } from "../server/index.js";

function values(overrides: Partial<CreateConfigValues>): CreateConfigValues {
  return {
    adapterType: "github_copilot_web",
    cwd: "",
    instructionsFilePath: "",
    promptTemplate: "",
    model: "",
    thinkingEffort: "",
    chrome: false,
    dangerouslySkipPermissions: false,
    search: false,
    fastMode: false,
    dangerouslyBypassSandbox: false,
    command: "",
    args: "",
    extraArgs: "",
    envVars: "",
    envBindings: {},
    url: "",
    bootstrapPrompt: "",
    payloadTemplateJson: "",
    workspaceStrategyType: "project_primary",
    workspaceBaseRef: "",
    workspaceBranchTemplate: "",
    worktreeParentDir: "",
    runtimeServicesJson: "",
    maxTurnsPerRun: 1000,
    heartbeatEnabled: false,
    intervalSec: 300,
    adapterSchemaValues: {},
    ...overrides,
  };
}

describe("buildGitHubCopilotWebConfig", () => {
  it("declares the required repository and base-ref fields for create and edit forms", () => {
    const fields = new Map(getConfigSchema().fields.map((field) => [field.key, field]));
    expect(fields.get("repository")).toMatchObject({ type: "text", required: true });
    expect(fields.get("baseRef")).toMatchObject({ type: "text", required: true });
  });

  it("preserves schema inputs and user-secret credential references", () => {
    expect(buildGitHubCopilotWebConfig(values({
      adapterSchemaValues: {
        repository: "octo/repo",
        baseRef: "main",
        createPullRequest: true,
      },
      model: "gpt-5.4",
      promptTemplate: "Implement {{context.taskId}}",
      envBindings: {
        GITHUB_TOKEN: {
          type: "user_secret_ref",
          key: "github_agent_tasks",
          required: true,
        },
      },
    }))).toEqual({
      repository: "octo/repo",
      baseRef: "main",
      createPullRequest: true,
      model: "gpt-5.4",
      promptTemplate: "Implement {{context.taskId}}",
      env: {
        GITHUB_TOKEN: {
          type: "user_secret_ref",
          key: "github_agent_tasks",
          required: true,
        },
      },
    });
  });
});
