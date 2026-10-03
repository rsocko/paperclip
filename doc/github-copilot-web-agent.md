# GitHub Copilot Web Agent adapter

`github_copilot_web` dispatches Paperclip runs to GitHub-hosted Copilot through
GitHub's public-preview Agent Tasks REST API. It does not invoke the local
Copilot CLI, ACP, Mission Control, or another Paperclip adapter.

## Prerequisites

- A Copilot Business or Copilot Enterprise entitlement.
- Copilot cloud agent enabled for the target repository and user. Paperclip
  verifies that `copilot-swe-agent` is present in the repository's GraphQL
  `suggestedActors`.
- A user-to-server GitHub credential with repository `Agent tasks: read and
  write`. Fine-grained PATs and GitHub App user access tokens are supported.
  GitHub App installation access tokens are not supported by Agent Tasks.
- Read access to repository metadata, refs, pull requests, and commits so
  Paperclip can verify repository identity and resolve provider artifacts.

In **New agent → GitHub Copilot Cloud**, enter the repository as exact
`owner/repo` text and enter an existing base branch. Enter a
user-to-server token or reuse your active `GITHUB_TOKEN` user secret. Paperclip
tests an entered token without storing it, then saves it as a user-owned secret
only after setup succeeds.

The agent stores only a required `user_secret_ref` at `env.GITHUB_TOKEN`.
The signed-in responsible user's value is resolved at test and run time.
Organization secrets, GitHub App installation tokens, plaintext adapter config,
and environment-level ambient tokens are not substitutes for this binding.
Edit an existing agent on its **Configuration** and **Environment variables**
sections to change the repository, base branch, or user-secret binding:

```json
{
  "adapterType": "github_copilot_web",
  "adapterConfig": {
    "repository": "owner/repository",
    "baseRef": "main",
    "model": "gpt-5.4",
    "createPullRequest": true,
    "pollIntervalSec": 10,
    "env": {
      "GITHUB_TOKEN": {
        "type": "user_secret_ref",
        "key": "GITHUB_TOKEN",
        "required": true
      }
    }
  }
}
```

Optional `headRef` continues an existing branch or matching pull request.
Optional `customAgent` is the `.github/agents/*.agent.md` filename without its
extension. Omitting `model` lets GitHub select a model.

**Test environment** verifies the repository identity, base branch, token access,
Copilot entitlement, and repository eligibility. The cancellation check is
informational. A valid setup returns `pass` even though Stop must wait for GitHub
to reach a terminal task state.

## Lifecycle and recovery

The adapter calls:

- `POST /agents/repos/{owner}/{repo}/tasks`
- `GET /agents/repos/{owner}/{repo}/tasks/{task_id}`
- `GET /agents/repos/{owner}/{repo}/tasks` for response-loss recovery

GitHub documents no Agent Tasks idempotency key. Paperclip therefore includes a
stable, non-secret marker derived from the Paperclip issue and run IDs in the
allowlisted task prompt. Before submission it searches a bounded seven-day,
100-task repository window and inspects task sessions for that exact marker.
This suppresses duplicate dispatch after a lost create response. The provider
task ID is then stored in adapter session state for restart reconciliation.

Provider states map as follows:

| GitHub | Paperclip result |
|---|---|
| `queued`, `in_progress` | Active run with coarse status events |
| `completed`, `idle` | Successful run |
| `waiting_for_user` | Failed/actionable run linking to the GitHub task |
| `failed`, `cancelled` | Failed run |
| `timed_out` | Timed-out run |

Task/session IDs, state, model and usage are retained. Branch artifacts are
resolved to their current commit. Pull artifacts are resolved through the pull
request API to a URL, head branch, base branch, and head commit. These references
are returned in `resultJson.workProducts`.

## Cancellation boundary

GitHub's public-preview reference currently documents no cancellation endpoint.
Paperclip never reports provider cancellation as successful. If Stop is
requested after dispatch, the adapter logs the limitation and continues bounded
polling/retry behavior until GitHub reports a terminal state. Stop therefore
cannot guarantee prompt provider termination for this adapter.

## API assumptions

The adapter sends `Accept: application/vnd.github+json` and
`X-GitHub-Api-Version: 2026-03-10`, which is the version named by the current
Agent Tasks REST reference. GitHub's separate how-to page still shows
`2022-11-28`; this is a public-preview documentation inconsistency. The adapter
uses only the documented request fields `prompt`, `base_ref`, `head_ref`,
`model`, `custom_agent`, and `create_pull_request`.

GitHub publishes no Agent Tasks-specific rate window. Paperclip honors
`Retry-After` and `X-RateLimit-Reset`, bounds backoff to 60 seconds, and stops
after five consecutive transient polling failures with an actionable retry
timestamp. Submission is never automatically replayed after an HTTP response;
recovery always searches for the stable marker first.

## Mission Control routing

Mission Control integrations that require this hosted runtime must set:

```json
{
  "requiredAdapterType": "github_copilot_web"
}
```

That requirement prevents Paperclip from selecting a local Copilot CLI adapter,
another provider, another repository, or a Mission Control loopback.
