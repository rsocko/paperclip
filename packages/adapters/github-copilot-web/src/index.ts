export const type = "github_copilot_web";
export const label = "GitHub Copilot Web Agent";

export const models = [
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4.6", label: "Claude Opus 4.6" },
  { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4.5", label: "Claude Opus 4.5" },
];

export const agentConfigurationDoc = `# github_copilot_web agent configuration

Adapter: github_copilot_web

Use when:
- Paperclip must dispatch coding work to GitHub-hosted Copilot cloud agent through the official Agent Tasks REST API
- The target is one exact GitHub repository and base branch
- Provider-side branch and pull-request artifacts must be reconciled into the Paperclip run

Don't use when:
- Work must execute locally (use a local CLI adapter)
- The credential is a GitHub App installation token; Agent Tasks requires a user-to-server token
- The target repository is ambiguous or may change at runtime
- The caller expects Paperclip to cancel provider work; GitHub currently documents no Agent Tasks cancellation endpoint

Core fields:
- repository (string, required): exact owner/repo target
- baseRef (string, required): exact branch used as the task base
- headRef (string, optional): existing branch/PR head to continue
- model (string, optional): exact GitHub-supported model; omit for auto-selection
- customAgent (string, optional): .github/agents filename without .agent.md
- createPullRequest (boolean, required): request provider PR creation
- promptTemplate (string, optional): Paperclip prompt template
- pollIntervalSec (number, optional): polling interval, default 10 and bounded to 5-60
- env.GITHUB_TOKEN (required): user-to-server GitHub credential. Configure this as a required user_secret_ref owned by the responsible user; never use a company secret, installation token, or persisted plaintext token.

Runtime guarantees:
- No fallback to local Copilot CLI, another adapter, repository, or orchestrator.
- Dispatch recovery uses a stable Paperclip issue/run marker because GitHub documents no idempotency key.
- Repository identity is verified before dispatch and on every provider response.
- Provider task, session, model, branch, commit, PR, and usage references are returned in durable session/result data.
- Existing Paperclip approval and budget admission gates run before the adapter's onDispatch boundary.
- The cancellation diagnostic is informational. GitHub documents no cancellation endpoint, so Stop keeps reconciling until the provider reports a terminal state.
`;
