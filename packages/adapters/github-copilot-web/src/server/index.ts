export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { sessionCodec } from "./session.js";
export {
  GITHUB_API_VERSION,
  GitHubAgentTasksClient,
  GitHubApiError,
  TASK_STATES,
} from "./client.js";

import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { models } from "../index.js";

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "repository",
        label: "GitHub repository",
        type: "text",
        required: true,
        hint: "Exact owner/repo target. The adapter never falls back to another repository.",
      },
      {
        key: "baseRef",
        label: "Base ref",
        type: "text",
        required: true,
        hint: "Existing branch used as the base for the cloud task.",
      },
      {
        key: "headRef",
        label: "Existing head ref",
        type: "text",
        hint: "Optional existing branch or pull-request head to continue.",
      },
      {
        key: "customAgent",
        label: "Custom agent",
        type: "text",
        hint: "Optional .github/agents filename without the .agent.md extension.",
      },
      {
        key: "createPullRequest",
        label: "Create pull request",
        type: "toggle",
        default: true,
        hint: "Ask GitHub Copilot to create a pull request when the task completes.",
      },
      {
        key: "pollIntervalSec",
        label: "Polling interval (seconds)",
        type: "number",
        default: 10,
        hint: "Bounded to 5-60 seconds. Rate-limit responses apply a longer retry delay.",
      },
    ],
  };
}

export const supportedModels = models;
