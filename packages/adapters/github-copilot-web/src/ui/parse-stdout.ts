import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseGitHubCopilotWebStdoutLine(line: string, ts: string): TranscriptEntry[] {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = record(JSON.parse(line));
  } catch {
    return [{ kind: "stdout", ts, text: line }];
  }
  if (!parsed) return [{ kind: "stdout", ts, text: line }];
  const type = text(parsed.type);
  if (type === "github_copilot_web.init") {
    return [{
      kind: "init",
      ts,
      model: text(parsed.model) || "github_copilot_web",
      sessionId: text(parsed.taskId),
    }];
  }
  if (type === "github_copilot_web.status") {
    return [{
      kind: "system",
      ts,
      text: `${text(parsed.state) || "status"}${parsed.message ? `: ${text(parsed.message)}` : ""}`,
    }];
  }
  if (type === "github_copilot_web.result") {
    const state = text(parsed.state) || "failed";
    return [{
      kind: "result",
      ts,
      text: text(parsed.htmlUrl),
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      subtype: state,
      isError: !["completed", "idle"].includes(state),
      errors: parsed.error ? [text(parsed.error)] : [],
    }];
  }
  return [{ kind: "stdout", ts, text: line }];
}
