import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterInvocationMeta,
} from "@paperclipai/adapter-utils";
import {
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  asBoolean,
  asNumber,
  asString,
  joinPromptSections,
  parseObject,
  renderTemplate,
  selectPaperclipPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import {
  GitHubAgentTasksClient,
  GitHubApiError,
  TASK_STATES,
  type GitHubTask,
  type GitHubTaskState,
} from "./client.js";

const MODELS = new Set([
  "claude-sonnet-4.6",
  "claude-opus-4.6",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.4",
  "claude-sonnet-4.5",
  "claude-opus-4.5",
]);
const ACTIVE_STATES = new Set<GitHubTaskState>(["queued", "in_progress"]);

type Session = {
  taskId: string;
  repository: string;
  repositoryId: number;
  dispatchKey: string;
  state?: string;
  baseRef?: string;
  headRef?: string;
  model?: string;
  htmlUrl?: string;
  pullRequestUrl?: string;
  commitSha?: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function envMap(value: unknown): Record<string, string> {
  const env = parseObject(value);
  return Object.fromEntries(
    Object.entries(env).flatMap(([key, entry]) => {
      if (typeof entry === "string") return [[key, entry]];
      const binding = parseObject(entry);
      return binding.type === "plain" && typeof binding.value === "string"
        ? [[key, binding.value]]
        : [];
    }),
  );
}

function parseRepository(value: string): { owner: string; repo: string; fullName: string } | null {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value.trim());
  return match ? { owner: match[1]!, repo: match[2]!, fullName: `${match[1]}/${match[2]}` } : null;
}

function readSession(value: Record<string, unknown> | null): Session | null {
  if (!value) return null;
  const taskId = text(value.taskId);
  const repository = text(value.repository);
  const repositoryId = typeof value.repositoryId === "number" ? value.repositoryId : null;
  const dispatchKey = text(value.dispatchKey);
  if (!taskId || !repository || repositoryId === null || !dispatchKey) return null;
  return {
    taskId,
    repository,
    repositoryId,
    dispatchKey,
    ...(text(value.state) ? { state: text(value.state)! } : {}),
    ...(text(value.baseRef) ? { baseRef: text(value.baseRef)! } : {}),
    ...(text(value.headRef) ? { headRef: text(value.headRef)! } : {}),
    ...(text(value.model) ? { model: text(value.model)! } : {}),
    ...(text(value.htmlUrl) ? { htmlUrl: text(value.htmlUrl)! } : {}),
    ...(text(value.pullRequestUrl) ? { pullRequestUrl: text(value.pullRequestUrl)! } : {}),
    ...(text(value.commitSha) ? { commitSha: text(value.commitSha)! } : {}),
  };
}

function event(type: string, payload: Record<string, unknown>): string {
  return `${JSON.stringify({ type, ...payload })}\n`;
}

function dispatchKey(ctx: AdapterExecutionContext): string {
  const issueId = text(ctx.context.issueId) ?? text(ctx.context.taskId) ?? "unscoped";
  return `paperclip:${issueId}:${ctx.runId}`;
}

function marker(key: string): string {
  return `[paperclip-dispatch:${key}]`;
}

function latestSession(task: GitHubTask) {
  return task.sessions?.at(-1) ?? null;
}

function errorMessage(task: GitHubTask): string | null {
  return text(latestSession(task)?.error?.message);
}

function failureResult(message: string, extra: Partial<AdapterExecutionResult> = {}): AdapterExecutionResult {
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorMessage: message,
    provider: "github",
    biller: "github",
    billingType: "subscription_included",
    clearSession: false,
    ...extra,
  };
}

function formatApiError(error: unknown): AdapterExecutionResult {
  if (!(error instanceof GitHubApiError)) {
    return failureResult(error instanceof Error ? error.message : String(error));
  }
  const detail = error.status === 401
    ? "The user-to-server GitHub credential is invalid or expired."
    : error.status === 403
      ? "The user needs Copilot Business or Enterprise entitlement and Agent tasks read/write permission for this repository."
      : error.status === 404
        ? "The configured repository was not found or the user credential cannot access it."
        : error.status === 422
          ? "GitHub rejected the repository, base branch, model, custom agent, or task prompt."
          : error.status === 429
            ? "GitHub rate-limited Agent Tasks polling."
            : error.message;
  return failureResult(`${detail} GitHub response: ${error.message}`, {
    errorCode: error.status === 429 || error.status >= 500 ? "github_rate_limited" : "github_agent_tasks_error",
    errorFamily: error.status === 429 || error.status >= 500 ? "transient_upstream" : undefined,
    retryNotBefore: error.retryAt,
    errorMeta: { status: error.status },
  });
}

async function recoverTask(input: {
  client: GitHubAgentTasksClient;
  owner: string;
  repo: string;
  key: string;
}): Promise<GitHubTask | null> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const tasks = await input.client.listTasks(input.owner, input.repo, since);
  for (const candidate of tasks) {
    const detail = await input.client.getTask(input.owner, input.repo, candidate.id);
    if (detail.sessions?.some((session) => session.prompt?.includes(marker(input.key)))) {
      return detail;
    }
  }
  return null;
}

async function recoverAmbiguousSubmission(input: {
  client: GitHubAgentTasksClient;
  owner: string;
  repo: string;
  key: string;
}): Promise<GitHubTask | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(2_000 * attempt);
    const recovered = await recoverTask(input);
    if (recovered) return recovered;
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTask(input: {
  client: GitHubAgentTasksClient;
  owner: string;
  repo: string;
  task: GitHubTask;
  intervalMs: number;
  ctx: AdapterExecutionContext;
}): Promise<GitHubTask> {
  let task = input.task;
  let lastState: string | null = null;
  let cancellationLogged = false;
  let transientFailures = 0;
  while (ACTIVE_STATES.has(task.state)) {
    if (task.state !== lastState) {
      lastState = task.state;
      await input.ctx.onLog("stdout", event("github_copilot_web.status", {
        taskId: task.id,
        state: task.state,
        message: task.state === "queued" ? "Waiting for GitHub-hosted capacity." : "GitHub Copilot is working.",
      }));
      await input.ctx.onRuntimeProgress?.({
        phase: "adapter_startup",
        message: task.state === "queued" ? "Queued at GitHub" : "GitHub Copilot is working",
      });
    }
    if (input.ctx.signal?.aborted && !cancellationLogged) {
      cancellationLogged = true;
      await input.ctx.onLog(
        "stderr",
        "[paperclip] Stop requested, but GitHub Agent Tasks has no cancellation endpoint. Paperclip will keep reconciling until GitHub reports a terminal state.\n",
      );
    }
    await sleep(input.intervalMs);
    try {
      task = await input.client.getTask(input.owner, input.repo, task.id);
      transientFailures = 0;
    } catch (error) {
      if (!(error instanceof GitHubApiError) || (error.status !== 429 && error.status < 500)) throw error;
      transientFailures += 1;
      if (transientFailures > 5) throw error;
      const retryAt = error.retryAt ? Date.parse(error.retryAt) : Number.NaN;
      const retryMs = Number.isFinite(retryAt)
        ? Math.min(60_000, Math.max(input.intervalMs, retryAt - Date.now()))
        : Math.min(60_000, input.intervalMs * 2 ** transientFailures);
      await input.ctx.onLog("stderr", `[paperclip] GitHub polling delayed after HTTP ${error.status}; retrying.\n`);
      await sleep(retryMs);
    }
  }
  return task;
}

async function resolveArtifacts(
  client: GitHubAgentTasksClient,
  owner: string,
  repo: string,
  task: GitHubTask,
): Promise<{ headRef: string | null; baseRef: string | null; commitSha: string | null; pullRequestUrl: string | null; pullRequestNumber: number | null }> {
  let headRef = text(latestSession(task)?.head_ref);
  let baseRef = text(latestSession(task)?.base_ref);
  let commitSha: string | null = null;
  let pullRequestUrl: string | null = null;
  let pullRequestNumber: number | null = null;
  for (const artifact of task.artifacts ?? []) {
    if (artifact.provider !== "github") continue;
    if (artifact.type === "branch") {
      headRef = text(artifact.data?.head_ref) ?? headRef;
      baseRef = text(artifact.data?.base_ref) ?? baseRef;
    }
    if (artifact.type === "pull" && typeof artifact.data?.id === "number") {
      pullRequestNumber = artifact.data.id;
      const pull = await client.getPull(owner, repo, pullRequestNumber);
      pullRequestUrl = text(pull.html_url);
      headRef = text(pull.head?.ref) ?? headRef;
      baseRef = text(pull.base?.ref) ?? baseRef;
      commitSha = text(pull.head?.sha);
    }
  }
  if (!commitSha && headRef) {
    try {
      commitSha = text((await client.getRef(owner, repo, headRef)).object?.sha);
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    }
  }
  return { headRef, baseRef, commitSha, pullRequestUrl, pullRequestNumber };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const env = envMap(config.env);
  const token = text(env.GITHUB_TOKEN);
  if (!token) {
    return failureResult(
      "github_copilot_web requires env.GITHUB_TOKEN resolved from a user_secret_ref. Plaintext credentials are not accepted.",
      { errorCode: "github_user_token_missing" },
    );
  }
  const configuredToken = parseObject(parseObject(ctx.agent.adapterConfig).env).GITHUB_TOKEN;
  const configuredTokenBinding = parseObject(configuredToken);
  if (
    configuredTokenBinding.type !== "user_secret_ref"
    || !text(configuredTokenBinding.key)
  ) {
    return failureResult(
      "github_copilot_web only accepts GITHUB_TOKEN through a user_secret_ref; remove the persisted plaintext binding.",
      { errorCode: "github_user_token_not_reference" },
    );
  }

  const repository = parseRepository(asString(config.repository, ""));
  if (!repository) return failureResult("repository must be an exact GitHub owner/repo value.");
  const baseRef = text(config.baseRef);
  if (!baseRef) return failureResult("Base branch is required and must name an existing branch.");
  const headRef = text(config.headRef);
  const model = text(config.model);
  if (model && !MODELS.has(model)) return failureResult(`Unsupported GitHub Agent Tasks model "${model}".`);
  const customAgent = text(config.customAgent);
  if (customAgent && !/^[A-Za-z0-9_.-]+$/.test(customAgent)) {
    return failureResult("customAgent must be a .github/agents filename without the .agent.md extension.");
  }
  const createPullRequest = asBoolean(config.createPullRequest, true);
  const intervalMs = Math.min(60, Math.max(5, asNumber(config.pollIntervalSec, 10))) * 1000;
  const client = new GitHubAgentTasksClient(token);
  const key = dispatchKey(ctx);
  const savedSession = readSession(ctx.runtime.sessionParams);
  if (savedSession && savedSession.repository.toLowerCase() !== repository.fullName.toLowerCase()) {
    return failureResult("Saved GitHub task identity does not match this repository and Paperclip run.", {
      errorCode: "github_task_identity_mismatch",
    });
  }
  const existing = savedSession?.dispatchKey === key ? savedSession : null;
  await ctx.onCancellationReady?.();
  if (ctx.signal?.aborted) {
    return failureResult("GitHub Copilot dispatch was cancelled before provider work started.", {
      errorCode: "cancelled",
      executionRecovery: { kind: "bootstrap", providerWorkStarted: false },
    });
  }

  const templateData = {
    agentId: ctx.agent.id,
    companyId: ctx.agent.companyId,
    runId: ctx.runId,
    company: { id: ctx.agent.companyId },
    agent: ctx.agent,
    run: { id: ctx.runId, source: "on_demand" },
    context: ctx.context,
  };
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const { wakePrompt, taskContextNote } = selectPaperclipPromptSections(ctx.context, {
    resumedSession: Boolean(existing),
    includeCommunicationGuidance: false,
  });
  const prompt = joinPromptSections([
    marker(key),
    "Work only in the configured repository and base branch. Do not delegate execution to another orchestrator.",
    wakePrompt,
    taskContextNote,
    renderTemplate(promptTemplate, templateData),
  ]);
  if (prompt.length > 65_000) return failureResult("Rendered Agent Tasks prompt exceeds Paperclip's 65,000 character safety limit.");

  try {
    const repoIdentity = await client.getRepository(repository.owner, repository.repo);
    if (
      repoIdentity.full_name.toLowerCase() !== repository.fullName.toLowerCase()
      || (existing && existing.repositoryId !== repoIdentity.id)
    ) {
      return failureResult("GitHub repository identity does not match the configured or saved repository.", {
        errorCode: "github_repository_mismatch",
      });
    }
    await client.getRef(repository.owner, repository.repo, baseRef);
    if (headRef) await client.getRef(repository.owner, repository.repo, headRef);
    const eligibility = await client.getCopilotEligibility(repository.owner, repository.repo);
    if (!eligibility.copilotActorId) {
      return failureResult(
        "GitHub Copilot is not an assignable suggested actor for this repository and user. Verify Copilot Business/Enterprise entitlement and repository policy.",
        { errorCode: "github_copilot_not_eligible" },
      );
    }

    if (ctx.onMeta) {
      const meta: AdapterInvocationMeta = {
        adapterType: "github_copilot_web",
        command: `POST /agents/repos/${repository.fullName}/tasks`,
        commandNotes: [
          `Repository: ${repository.fullName}`,
          `Base branch: ${baseRef}`,
          `Create pull request: ${createPullRequest}`,
          "Authentication: resolved user-to-server credential (redacted)",
        ],
        prompt,
        context: {
          githubCopilotWeb: {
            repository: repository.fullName,
            repositoryId: repoIdentity.id,
            baseRef,
            headRef,
            model,
            createPullRequest,
            dispatchKey: key,
          },
        },
      };
      await ctx.onMeta(meta);
    }

    let task: GitHubTask | null = existing
      ? await client.getTask(repository.owner, repository.repo, existing.taskId)
      : await recoverTask({ client, owner: repository.owner, repo: repository.repo, key });
    if (!task) {
      ctx.onDispatch?.();
      try {
        task = await client.createTask(repository.owner, repository.repo, {
          prompt,
          base_ref: baseRef,
          create_pull_request: createPullRequest,
          ...(model ? { model } : {}),
          ...(headRef ? { head_ref: headRef } : {}),
          ...(customAgent ? { custom_agent: customAgent } : {}),
        });
      } catch (error) {
        const ambiguous =
          !(error instanceof GitHubApiError)
          || error.status === 429
          || error.status >= 500;
        if (!ambiguous) throw error;
        await ctx.onLog(
          "stderr",
          "[paperclip] GitHub task submission response was ambiguous; reconciling the stable dispatch marker before failing.\n",
        );
        task = await recoverAmbiguousSubmission({
          client,
          owner: repository.owner,
          repo: repository.repo,
          key,
        });
        if (!task) throw error;
      }
    } else {
      ctx.onDispatch?.();
      await ctx.onLog("stdout", event("github_copilot_web.status", {
        taskId: task.id,
        state: task.state,
        message: "Recovered existing GitHub task; duplicate dispatch suppressed.",
      }));
    }
    if (!TASK_STATES.includes(task.state)) {
      return failureResult(`GitHub returned unsupported task state "${String(task.state)}".`);
    }
    if (task.repository?.id !== undefined && task.repository.id !== repoIdentity.id) {
      return failureResult("GitHub task repository identity does not match the configured repository.", {
        errorCode: "github_repository_mismatch",
      });
    }
    await ctx.onLog("stdout", event("github_copilot_web.init", {
      taskId: task.id,
      state: task.state,
      repository: repository.fullName,
      htmlUrl: task.html_url,
      model,
    }));
    task = await pollTask({
      client,
      owner: repository.owner,
      repo: repository.repo,
      task,
      intervalMs,
      ctx,
    });
    if (task.repository?.id !== undefined && task.repository.id !== repoIdentity.id) {
      return failureResult("GitHub task repository changed during reconciliation.", {
        errorCode: "github_repository_mismatch",
      });
    }
    const artifacts = await resolveArtifacts(client, repository.owner, repository.repo, task);
    const session = latestSession(task);
    const resolvedModel = text(session?.model) ?? model;
    const nextSession: Session = {
      taskId: task.id,
      repository: repository.fullName,
      repositoryId: repoIdentity.id,
      dispatchKey: key,
      state: task.state,
      baseRef: artifacts.baseRef ?? baseRef,
      ...(artifacts.headRef ? { headRef: artifacts.headRef } : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
      ...(text(task.html_url) ? { htmlUrl: text(task.html_url)! } : {}),
      ...(artifacts.pullRequestUrl ? { pullRequestUrl: artifacts.pullRequestUrl } : {}),
      ...(artifacts.commitSha ? { commitSha: artifacts.commitSha } : {}),
    };
    const providerError = errorMessage(task);
    const waiting = task.state === "waiting_for_user";
    const succeeded = task.state === "completed" || task.state === "idle";
    const message = waiting
      ? `GitHub Copilot is waiting for user input. Continue the task in GitHub: ${task.html_url ?? task.url ?? task.id}`
      : succeeded
        ? null
        : providerError ?? `GitHub Copilot task ${task.state}.`;
    await ctx.onLog("stdout", event("github_copilot_web.result", {
      taskId: task.id,
      state: task.state,
      repository: repository.fullName,
      htmlUrl: task.html_url,
      model: resolvedModel,
      artifacts,
      usage: session?.usage,
      error: message,
    }));
    return {
      exitCode: succeeded ? 0 : 1,
      signal: null,
      timedOut: task.state === "timed_out",
      errorMessage: message,
      errorCode: waiting ? "github_waiting_for_user" : succeeded ? null : `github_task_${task.state}`,
      sessionId: task.id,
      sessionDisplayId: task.id,
      sessionParams: nextSession,
      provider: "github",
      biller: "github",
      billingType: "subscription_included",
      model: resolvedModel,
      costUsd: null,
      summary: succeeded
        ? `GitHub Copilot task ${task.state}${artifacts.pullRequestUrl ? `: ${artifacts.pullRequestUrl}` : ""}`
        : message,
      resultJson: {
        providerTaskId: task.id,
        providerState: task.state,
        repository: repository.fullName,
        repositoryId: repoIdentity.id,
        taskUrl: task.html_url ?? task.url ?? null,
        sessionId: session?.id ?? null,
        model: resolvedModel,
        baseRef: artifacts.baseRef ?? baseRef,
        headRef: artifacts.headRef,
        commitSha: artifacts.commitSha,
        pullRequestNumber: artifacts.pullRequestNumber,
        pullRequestUrl: artifacts.pullRequestUrl,
        workProducts: [
          ...(artifacts.pullRequestUrl ? [{ type: "pull_request", url: artifacts.pullRequestUrl }] : []),
          ...(artifacts.headRef ? [{ type: "branch", repository: repository.fullName, ref: artifacts.headRef }] : []),
          ...(artifacts.commitSha ? [{ type: "commit", repository: repository.fullName, sha: artifacts.commitSha }] : []),
        ],
        usage: session?.usage ?? null,
        cancellationSupported: false,
      },
      clearSession: false,
    };
  } catch (error) {
    return formatApiError(error);
  }
}
