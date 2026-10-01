import type { UIAdapterModule } from "../types";
import { SchemaConfigFields } from "../schema-config-fields";
import {
  buildGitHubCopilotWebConfig,
  parseGitHubCopilotWebStdoutLine,
} from "@paperclipai/adapter-github-copilot-web/ui";

export const githubCopilotWebUIAdapter: UIAdapterModule = {
  type: "github_copilot_web",
  label: "GitHub Copilot Web Agent",
  parseStdoutLine: parseGitHubCopilotWebStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildGitHubCopilotWebConfig,
};
