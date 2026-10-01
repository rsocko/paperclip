import { describe, expect, it } from "vitest";
import { sessionCodec } from "./session.js";

describe("github_copilot_web session codec", () => {
  it("round-trips durable provider and artifact identity", () => {
    const session = {
      taskId: "task-1",
      repository: "octo/repo",
      repositoryId: 101,
      dispatchKey: "paperclip:issue-1:run-1",
      state: "completed",
      baseRef: "main",
      headRef: "copilot/fix",
      model: "gpt-5.4",
      htmlUrl: "https://github.com/copilot/tasks/task-1",
      pullRequestUrl: "https://github.com/octo/repo/pull/42",
      commitSha: "abc123",
    };
    expect(sessionCodec.deserialize(session)).toEqual(session);
    expect(sessionCodec.serialize(session)).toEqual(session);
    expect(sessionCodec.getDisplayId?.(session)).toBe("task-1");
  });

  it("rejects incomplete or cross-shaped state", () => {
    expect(sessionCodec.deserialize({ taskId: "task-1" })).toBeNull();
    expect(sessionCodec.deserialize([])).toBeNull();
  });
});
