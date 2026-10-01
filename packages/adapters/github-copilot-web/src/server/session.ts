import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: unknown): Record<string, unknown> | null {
  const raw = record(value);
  if (!raw) return null;
  const taskId = text(raw.taskId);
  const repository = text(raw.repository);
  const repositoryId = typeof raw.repositoryId === "number" ? raw.repositoryId : null;
  const dispatchKey = text(raw.dispatchKey);
  if (!taskId || !repository || repositoryId === null || !dispatchKey) return null;
  return {
    taskId,
    repository,
    repositoryId,
    dispatchKey,
    ...(text(raw.state) ? { state: text(raw.state) } : {}),
    ...(text(raw.baseRef) ? { baseRef: text(raw.baseRef) } : {}),
    ...(text(raw.headRef) ? { headRef: text(raw.headRef) } : {}),
    ...(text(raw.model) ? { model: text(raw.model) } : {}),
    ...(text(raw.htmlUrl) ? { htmlUrl: text(raw.htmlUrl) } : {}),
    ...(text(raw.pullRequestUrl) ? { pullRequestUrl: text(raw.pullRequestUrl) } : {}),
    ...(text(raw.commitSha) ? { commitSha: text(raw.commitSha) } : {}),
  };
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize: normalize,
  serialize: normalize,
  getDisplayId(params) {
    return text(normalize(params)?.taskId);
  },
};
