export const GITHUB_API_VERSION = "2026-03-10";
export const TASK_STATES = [
  "queued",
  "in_progress",
  "idle",
  "waiting_for_user",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export type GitHubTaskState = typeof TASK_STATES[number];

export type GitHubTask = {
  id: string;
  url?: string;
  html_url?: string;
  name?: string;
  state: GitHubTaskState;
  repository?: { id?: number };
  artifacts?: Array<{
    provider?: string;
    type?: "pull" | "branch";
    data?: { id?: number; global_id?: string; head_ref?: string; base_ref?: string };
  }>;
  sessions?: Array<{
    id?: string;
    state?: GitHubTaskState;
    prompt?: string;
    head_ref?: string;
    base_ref?: string;
    model?: string;
    usage?: { type?: "ai_credits" | "premium_requests"; amount?: number };
    error?: { message?: string };
  }>;
  created_at?: string;
  updated_at?: string;
};

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAt: string | null,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseRetryAt(response: Response): string | null {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
  if (retryAfterHeader?.trim() && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return new Date(Date.now() + retryAfter * 1000).toISOString();
  }
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null;
}

export class GitHubAgentTasksClient {
  constructor(
    private readonly token: string,
    private readonly apiBaseUrl = "https://api.github.com",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "paperclip-github-copilot-web-adapter",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const message = asRecord(body)?.message;
      throw new GitHubApiError(
        typeof message === "string" ? message : `GitHub API returned HTTP ${response.status}`,
        response.status,
        parseRetryAt(response),
        body,
      );
    }
    return body;
  }

  async getRepository(owner: string, repo: string): Promise<{ id: number; full_name: string; default_branch?: string }> {
    return await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`) as {
      id: number;
      full_name: string;
      default_branch?: string;
    };
  }

  async getCopilotEligibility(owner: string, repo: string): Promise<{
    repositoryId: string;
    copilotActorId: string | null;
  }> {
    let cursor: string | null = null;
    let repositoryId: string | null = null;
    do {
      const body = await this.request("/graphql", {
        method: "POST",
        body: JSON.stringify({
          query: `query PaperclipCopilotEligibility($owner: String!, $repo: String!, $after: String) {
            repository(owner: $owner, name: $repo) {
              id
              suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100, after: $after) {
                nodes {
                  __typename
                  ... on Bot { id login }
                  ... on User { id login }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }`,
          variables: { owner, repo, after: cursor },
        }),
      });
      const repository = asRecord(asRecord(asRecord(body)?.data)?.repository);
      const pageRepositoryId = repository?.id;
      if (typeof pageRepositoryId !== "string") {
        throw new GitHubApiError("GitHub did not return the repository GraphQL identity.", 422, null, body);
      }
      repositoryId ??= pageRepositoryId;
      if (repositoryId !== pageRepositoryId) {
        throw new GitHubApiError("GitHub repository identity changed during eligibility validation.", 422, null, body);
      }
      const actors = asRecord(repository?.suggestedActors);
      const nodes = actors?.nodes;
      const copilot = Array.isArray(nodes)
        ? nodes.map(asRecord).find((node) => node?.login === "copilot-swe-agent") ?? null
        : null;
      if (typeof copilot?.id === "string") {
        return { repositoryId, copilotActorId: copilot.id };
      }
      const pageInfo = asRecord(actors?.pageInfo);
      cursor = pageInfo?.hasNextPage === true && typeof pageInfo.endCursor === "string"
        ? pageInfo.endCursor
        : null;
    } while (cursor);
    return {
      repositoryId: repositoryId!,
      copilotActorId: null,
    };
  }

  async getRef(owner: string, repo: string, ref: string): Promise<{ object?: { sha?: string } }> {
    return await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`) as {
      object?: { sha?: string };
    };
  }

  async getPull(owner: string, repo: string, number: number): Promise<{
    html_url?: string;
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
  }> {
    return await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`) as {
      html_url?: string;
      head?: { ref?: string; sha?: string };
      base?: { ref?: string };
    };
  }

  async createTask(
    owner: string,
    repo: string,
    body: {
      prompt: string;
      base_ref: string;
      create_pull_request: boolean;
      model?: string;
      head_ref?: string;
      custom_agent?: string;
    },
  ): Promise<GitHubTask> {
    return await this.request(`/agents/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as GitHubTask;
  }

  async getTask(owner: string, repo: string, taskId: string): Promise<GitHubTask> {
    return await this.request(`/agents/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(taskId)}`) as GitHubTask;
  }

  async listTasks(owner: string, repo: string, since: string): Promise<GitHubTask[]> {
    const query = new URLSearchParams({
      per_page: "100",
      sort: "created_at",
      direction: "desc",
      since,
    });
    const body = await this.request(`/agents/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tasks?${query}`);
    const tasks = asRecord(body)?.tasks;
    return Array.isArray(tasks) ? tasks as GitHubTask[] : [];
  }
}
