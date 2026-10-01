import pc from "picocolors";
import { parseGitHubCopilotWebStdoutLine } from "../ui/parse-stdout.js";

export function printGitHubCopilotWebEvent(raw: string, debug: boolean): void {
  const entries = parseGitHubCopilotWebStdoutLine(raw, new Date().toISOString());
  for (const entry of entries) {
    if (entry.kind === "init") console.log(pc.blue(`GitHub Copilot task ${entry.sessionId}`));
    else if (entry.kind === "system") console.log(pc.cyan(entry.text));
    else if (entry.kind === "result") console.log((entry.isError ? pc.red : pc.green)(`${entry.subtype}${entry.text ? `: ${entry.text}` : ""}`));
    else if (debug && "text" in entry) console.log(pc.gray(entry.text));
  }
}
