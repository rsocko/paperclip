import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { GitHubAgentTasksClient, GitHubApiError } from "./client.js";

const repository = { id: 101, full_name: "octo/repo", default_branch: "main" };
const eligibility = {
  data: {
    repository: {
      id: "R_repo",
      suggestedActors: { nodes: [{ __typename: "Bot", id: "BOT_copilot", login: "copilot-swe-agent" }] },
    },
  },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function context(overrides: Partial<AdapterExecutionContext> = {}): AdapterExecutionContext & {
  logs: string[];
  dispatches: { count: number };
} {
  const logs: string[] = [];
  const dispatches = { count: 0 };
  const adapterConfig = {
    repository: "octo/repo",
    baseRef: "main",
    createPullRequest: true,
    env: {
      GITHUB_TOKEN: { type: "user_secret_ref", key: "github_agent_tasks" },
    },
  };
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "GitHub agent",
      adapterType: "github_copilot_web",
      adapterConfig,
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: "issue-1",
    },
    config: {
      ...adapterConfig,
      env: { GITHUB_TOKEN: "secret-user-token" },
    },
    context: { issueId: "issue-1", taskId: "issue-1", wakeReason: "issue_assigned" },
    onLog: async (_stream, chunk) => { logs.push(chunk); },
    onDispatch: () => { dispatches.count += 1; },
    ...overrides,
    logs,
    dispatches,
  };
}

function installFetch(input: {
  createdTask?: Record<string, unknown>;
  listedTasks?: Record<string, unknown>[];
  taskDetail?: Record<string, unknown>;
  pull?: Record<string, unknown>;
  repositoryBody?: Record<string, unknown>;
  onCreate?: () => void;
}) {
  const requests: Array<{ url: string; method: string; body: string | null }> = [];
  const fetchMock = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
    const url = String(request);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: typeof init?.body === "string" ? init.body : null });
    if (url.endsWith("/repos/octo/repo") && method === "GET") return json(input.repositoryBody ?? repository);
    if (url.includes("/git/ref/heads/")) return json({ object: { sha: "base-sha" } });
    if (url.endsWith("/graphql")) return json(eligibility);
    if (url.includes("/agents/repos/octo/repo/tasks?")) return json({ tasks: input.listedTasks ?? [] });
    if (/\/agents\/repos\/octo\/repo\/tasks\/[^?]+$/.test(url)) {
      return json(input.taskDetail ?? input.createdTask ?? {
        id: "task-1",
        state: "completed",
        repository: { id: 101 },
        sessions: [{ id: "session-1", prompt: "[paperclip-dispatch:paperclip:issue-1:run-1]", model: "gpt-5.4" }],
      });
    }
    if (url.endsWith("/agents/repos/octo/repo/tasks") && method === "POST") {
      input.onCreate?.();
      return json(input.createdTask ?? {
        id: "task-1",
        state: "completed",
        repository: { id: 101 },
        html_url: "https://github.com/copilot/tasks/task-1",
        sessions: [{ id: "session-1", model: "gpt-5.4", base_ref: "main" }],
      }, 201);
    }
    if (url.endsWith("/repos/octo/repo/pulls/42")) {
      return json(input.pull ?? {
        html_url: "https://github.com/octo/repo/pull/42",
        head: { ref: "copilot/fix", sha: "commit-sha" },
        base: { ref: "main" },
      });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("github_copilot_web execute", () => {
  it("describes a missing baseRef as a missing base branch", async () => {
    const ctx = context();
    delete ctx.config.baseRef;

    expect((await execute(ctx)).errorMessage)
      .toBe("Base branch is required and must name an existing branch.");
  });

  it("rejects missing and persisted plaintext credentials before dispatch", async () => {
    const missing = context();
    missing.config.env = {};
    expect((await execute(missing)).errorCode).toBe("github_user_token_missing");

    const plain = context();
    plain.agent.adapterConfig = { ...plain.agent.adapterConfig as object, env: { GITHUB_TOKEN: "persisted" } };
    expect((await execute(plain)).errorCode).toBe("github_user_token_not_reference");

    const companySecret = context();
    companySecret.agent.adapterConfig = {
      ...companySecret.agent.adapterConfig as object,
      env: { GITHUB_TOKEN: { type: "secret_ref", secretId: "company-secret" } },
    };
    expect((await execute(companySecret)).errorCode).toBe("github_user_token_not_reference");
  });

  it("rejects unsupported model policy before contacting GitHub", async () => {
    const ctx = context();
    ctx.config.model = "unapproved-model";
    const result = await execute(ctx);
    expect(result.errorMessage).toContain("Unsupported GitHub Agent Tasks model");
    expect(ctx.dispatches.count).toBe(0);
  });

  it("blocks dispatch when Copilot is not an eligible suggested actor", async () => {
    const fetchMock = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      const url = String(request);
      if (url.endsWith("/repos/octo/repo")) return json(repository);
      if (url.includes("/git/ref/heads/main")) return json({ object: { sha: "base-sha" } });
      if (url.endsWith("/graphql") && init?.method === "POST") {
        return json({
          data: {
            repository: {
              id: "R_repo",
              suggestedActors: { nodes: [] },
            },
          },
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context();
    const result = await execute(ctx);
    expect(result.errorCode).toBe("github_copilot_not_eligible");
    expect(ctx.dispatches.count).toBe(0);
  });

  it("dispatches exact repository/ref/model/PR inputs and associates PR, branch, and commit", async () => {
    const { requests } = installFetch({
      createdTask: {
        id: "task-1",
        state: "completed",
        repository: { id: 101 },
        html_url: "https://github.com/copilot/tasks/task-1",
        artifacts: [
          { provider: "github", type: "branch", data: { head_ref: "copilot/fix", base_ref: "main" } },
          { provider: "github", type: "pull", data: { id: 42, global_id: "PR_42" } },
        ],
        sessions: [{ id: "session-1", model: "gpt-5.4", base_ref: "main" }],
      },
    });
    const ctx = context();
    const onMeta = vi.fn(async () => undefined);
    ctx.onMeta = onMeta;
    ctx.config.model = "gpt-5.4";
    const result = await execute(ctx);

    expect(result.exitCode).toBe(0);
    expect(result.resultJson).toMatchObject({
      providerTaskId: "task-1",
      repository: "octo/repo",
      model: "gpt-5.4",
      headRef: "copilot/fix",
      commitSha: "commit-sha",
      pullRequestNumber: 42,
      pullRequestUrl: "https://github.com/octo/repo/pull/42",
      cancellationSupported: false,
    });
    const create = requests.find((entry) => entry.method === "POST" && entry.url.endsWith("/tasks"));
    expect(JSON.parse(create!.body!)).toMatchObject({
      base_ref: "main",
      model: "gpt-5.4",
      create_pull_request: true,
    });
    expect(JSON.parse(create!.body!).prompt).toContain("[paperclip-dispatch:paperclip:issue-1:run-1]");
    expect(JSON.parse(create!.body!).prompt).toContain("configured repository and base branch");
    expect(onMeta).toHaveBeenCalledWith(expect.objectContaining({
      commandNotes: expect.arrayContaining(["Base branch: main"]),
    }));
    expect(ctx.dispatches.count).toBe(1);
  });

  it("suppresses duplicate dispatch by recovering the stable Paperclip marker", async () => {
    const recovered = {
      id: "task-existing",
      state: "completed",
      repository: { id: 101 },
      sessions: [{ id: "session-existing", prompt: "[paperclip-dispatch:paperclip:issue-1:run-1]", model: "gpt-5.4" }],
    };
    const { requests } = installFetch({
      listedTasks: [{ id: "task-existing", state: "completed" }],
      taskDetail: recovered,
    });
    const result = await execute(context());
    expect(result.sessionId).toBe("task-existing");
    expect(requests.filter((entry) => entry.method === "POST" && entry.url.endsWith("/tasks"))).toHaveLength(0);
  });

  it("resumes a saved provider task after restart without listing or creating", async () => {
    const { requests } = installFetch({
      taskDetail: {
        id: "task-saved",
        state: "completed",
        repository: { id: 101 },
        sessions: [{ id: "session-saved", model: "gpt-5.4" }],
      },
    });

    const ctx = context({
      runtime: {
        sessionId: "task-saved",
        sessionDisplayId: "task-saved",
        taskKey: "issue-1",
        sessionParams: {
          taskId: "task-saved",
          repository: "octo/repo",
          repositoryId: 101,
          dispatchKey: "paperclip:issue-1:run-1",
        },
      },
    });
    const result = await execute(ctx);
    expect(result.sessionId).toBe("task-saved");
    expect(requests.some((entry) => entry.url.includes("/tasks?"))).toBe(false);
    expect(requests.filter((entry) => entry.method === "POST" && entry.url.endsWith("/tasks"))).toHaveLength(0);
  });

  it("starts a fresh provider task on a later Paperclip wake", async () => {
    const { requests } = installFetch({});
    const ctx = context({
      runId: "run-2",
      runtime: {
        sessionId: "task-prior",
        sessionDisplayId: "task-prior",
        taskKey: "issue-1",
        sessionParams: {
          taskId: "task-prior",
          repository: "octo/repo",
          repositoryId: 101,
          dispatchKey: "paperclip:issue-1:run-1",
        },
      },
    });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(requests.filter((entry) => entry.method === "POST" && entry.url.endsWith("/tasks"))).toHaveLength(1);
  });

  it("recovers an accepted task after an ambiguous submission response", async () => {
    let detailReads = 0;
    const fetchMock = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      const url = String(request);
      const method = init?.method ?? "GET";
      if (url.endsWith("/repos/octo/repo") && method === "GET") return json(repository);
      if (url.includes("/git/ref/heads/main")) return json({ object: { sha: "base-sha" } });
      if (url.endsWith("/graphql")) return json(eligibility);
      if (url.includes("/agents/repos/octo/repo/tasks?")) {
        return detailReads === 0
          ? json({ tasks: [] })
          : json({ tasks: [{ id: "task-accepted", state: "completed" }] });
      }
      if (url.endsWith("/agents/repos/octo/repo/tasks") && method === "POST") {
        detailReads += 1;
        throw new TypeError("socket closed after request body was sent");
      }
      if (url.endsWith("/agents/repos/octo/repo/tasks/task-accepted")) {
        return json({
          id: "task-accepted",
          state: "completed",
          repository: { id: 101 },
          sessions: [{
            id: "session-accepted",
            prompt: "[paperclip-dispatch:paperclip:issue-1:run-1]",
          }],
        });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await execute(context());
    expect(result.sessionId).toBe("task-accepted");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });

  it.each([
    ["completed", 0, false],
    ["idle", 0, false],
    ["failed", 1, false],
    ["timed_out", 1, true],
    ["cancelled", 1, false],
    ["waiting_for_user", 1, false],
  ] as const)("maps provider state %s", async (state, exitCode, timedOut) => {
    installFetch({
      createdTask: {
        id: `task-${state}`,
        state,
        repository: { id: 101 },
        html_url: `https://github.com/copilot/tasks/${state}`,
        sessions: [{ id: `session-${state}`, state, error: state === "failed" ? { message: "provider failed" } : undefined }],
      },
    });
    const result = await execute(context());
    expect(result.exitCode).toBe(exitCode);
    expect(result.timedOut).toBe(timedOut);
    if (state === "waiting_for_user") expect(result.errorMessage).toContain("Continue the task in GitHub");
  });

  it("rejects a provider task whose repository identity differs", async () => {
    installFetch({
      createdTask: {
        id: "task-wrong-repo",
        state: "completed",
        repository: { id: 999 },
        sessions: [],
      },
    });
    const result = await execute(context());
    expect(result.errorCode).toBe("github_repository_mismatch");
  });

  it("surfaces rate-limit retry timing without retrying a submission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(
      { message: "API rate limit exceeded" },
      429,
      { "retry-after": "30" },
    )));
    const client = new GitHubAgentTasksClient("token");
    const error = await client.getTask("octo", "repo", "task").catch((value) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error.status).toBe(429);
    expect(Date.parse(error.retryAt)).toBeGreaterThan(Date.now());
  });

  it("uses X-RateLimit-Reset when Retry-After is absent", async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    vi.stubGlobal("fetch", vi.fn(async () => json(
      { message: "API rate limit exceeded" },
      429,
      { "x-ratelimit-reset": String(reset) },
    )));
    const client = new GitHubAgentTasksClient("token");
    const error = await client.getTask("octo", "repo", "task").catch((value) => value);
    expect(error.retryAt).toBe(new Date(reset * 1000).toISOString());
  });

  it("does not claim cancellation and reconciles until GitHub is terminal", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    installFetch({
      onCreate: () => abort.abort(),
      createdTask: {
        id: "task-running",
        state: "queued",
        repository: { id: 101 },
        sessions: [],
      },
      taskDetail: {
        id: "task-running",
        state: "completed",
        repository: { id: 101 },
        sessions: [{ id: "session-running" }],
      },
    });
    const ctx = context({ signal: abort.signal });
    const promise = execute(ctx);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.exitCode).toBe(0);
    expect(result.resultJson).toMatchObject({ cancellationSupported: false, providerState: "completed" });
    expect(ctx.logs.join("")).toContain("no cancellation endpoint");
  });

  it("honors cancellation before the provider dispatch boundary", async () => {
    const abort = new AbortController();
    abort.abort();
    const ctx = context({ signal: abort.signal, onCancellationReady: vi.fn() });
    const result = await execute(ctx);
    expect(result).toMatchObject({
      errorCode: "cancelled",
      executionRecovery: { kind: "bootstrap", providerWorkStarted: false },
    });
    expect(ctx.dispatches.count).toBe(0);
  });
});
