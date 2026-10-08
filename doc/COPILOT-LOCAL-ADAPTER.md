# GitHub Copilot local adapter image

This deployment image adds the community
[`@shayben/paperclip-adapter-copilot-local`](https://github.com/shayben/paperclip-adapter-copilot-local)
adapter to the standard Paperclip production image.

The adapter runs GitHub Copilot CLI through ACP stdio in the Paperclip server
container. It does not use a remote adapter transport or a sister container.

## Image contents

- Docker target: `copilot-local`
- Adapter path: `/opt/paperclip/adapters/copilot-local`
- Adapter version: `0.1.0`
- Adapter source commit: `69a2c6e399d342ce59cc7d3d27084d936b55a705`
- GitHub Copilot CLI: `@github/copilot@1.0.90`
- Runtime tools: Node.js, `git`, `gh`, OpenSSH client, and CA certificates

The image does not add Playwright, a browser, Terraform, OpenTofu, Kubernetes
clients, Helm, or Ansible.

The adapter source archive has a pinned SHA-256 checksum. Its direct build
dependencies and full pnpm dependency graph are locked in
`docker/copilot-local-adapter/pnpm-lock.yaml`. The upstream `README.md` and
MIT `LICENSE` remain in the installed artifact.

## One-time installation

The image does not change Paperclip user or adapter state at startup.

1. Open **Settings > Adapters** as an instance administrator.
2. Select the local path installation option.
3. Enter `/opt/paperclip/adapters/copilot-local`.
4. Install the adapter.
5. Confirm that `copilot_local` appears as an external adapter at version
   `0.1.0`.

Paperclip stores this registration in its persistent Paperclip home. A container
restart keeps the registration when `/paperclip` is persistent.

## Authentication and configuration

Do not put a GitHub token in the image, a build argument, or the container-wide
environment.

Create a Paperclip secret for the token. Bind that secret to the agent adapter
environment as `COPILOT_GITHUB_TOKEN`. `GH_TOKEN` and `GITHUB_TOKEN` also work,
but `COPILOT_GITHUB_TOKEN` is the preferred explicit binding. The token must
belong to an account with a GitHub Copilot entitlement and must use a token type
supported by Copilot CLI.

The adapter marks GitHub token variables as secret child-process variables. It
also launches Copilot with `--no-auto-update`, `--no-remote`,
`--no-remote-export`, and ACP stdio. Use the default `copilot` command. Do not
configure a remote execution target.

## Task model overrides

Agents keep their default `model` and `reasoningEffort` in the installed
adapter configuration. A task can select a different model and reasoning
effort without changing the agent. The Primary lane stores no task override.
The Custom or Override lane stores only non-empty `model` and
`reasoningEffort` values. Task values take precedence for that run.

Paperclip rejects every other adapter configuration key from the task merge.
Secrets, environment variables, permissions, timeouts, ACP mode, context
settings, and extra arguments remain agent-level configuration.

The model selector reads the adapter model API. Set
`PAPERCLIP_ADAPTER_MODELS` to declare the available `copilot_local` models.
The deployment image declares the model catalog currently exposed by GitHub
Copilot Desktop, including its Claude, GPT, MAI, Gemini, and Grok choices. The
selector preserves an `auto` entry from that list and accepts a manual model ID.
The environment variable can replace the image default for a specific
deployment.

Authenticated, account-specific model discovery remains future work. Paperclip
does not currently enumerate the Copilot account's models dynamically, so the
static catalog can include models unavailable to a particular account or omit a
newly released model until the deployment configuration is refreshed.

Reasoning effort and context window are agent configuration fields. The adapter
passes non-empty effort values to `copilot --effort` and maps the context-window
selection to `copilot --context default|long_context`. Model support still
depends on the authenticated account and selected model.

## Token accounting

Paperclip treats the token breakdown reported by the Copilot ACP runtime for a
completed turn as **per-run usage**. Resuming an ACP session does not make those
token values session totals, so Paperclip records each run's reported input,
cached-input, and output tokens directly and does not subtract a prior run.
Cached input remains a separate quantity in the ledger and in provider, biller,
agent/model, project, issue, and rolling-window aggregates.

The ACP runtime's cost amount has different semantics: it is a
**session-cumulative counter**. Paperclip snapshots it before the turn and bills
only the non-negative post-turn delta. If that counter resets, the post-turn
amount is the new run cost. This split prevents resumed sessions from having
their tokens delta-adjusted twice while still preventing cumulative cost from
being double counted. Adapters that explicitly return session-cumulative token
usage continue to use Paperclip's existing session-delta path; this adapter
returns per-run usage.

GitHub documents Copilot CLI ACP support as public preview, and the
[ACP server reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)
does not define a guaranteed token-usage payload for each prompt. Paperclip
therefore accounts only for usage present in the runtime status or a current
`usage_update` event. It does not infer omitted tokens:

- a supplied receipt, including an explicit all-zero receipt, is `reported`;
- an omitted receipt is `unavailable`, not zero;
- an unchanged status breakdown without a current usage event is stale and is
  not reused for a later run.

Subscription-included Copilot runs create $0 ledger events even when token usage
is unavailable. This preserves the fact that a run occurred and lets the UI say
that GitHub omitted usage instead of presenting a misleading zero. Dollar
budgets continue to evaluate billed cents. Token guardrails are separate
policies that evaluate input plus cached-input plus output tokens; unavailable
events cannot contribute an inferred token amount.

## Validation

The image build runs the upstream adapter unit tests. It then verifies:

- the exact adapter and Copilot CLI versions;
- `createServerAdapter()` loadability and the `copilot_local` ACP descriptor;
- the managed ACP flags, including disabled update and remote export;
- the stable read-only adapter path;
- the required command-line tools and CA bundle;
- the absence of browser and deployment/IaC tools.

The GHCR workflow repeats the image assertion against the published AMD64
digest. It also verifies an anonymous registry pull before it completes.
Every push to `master` publishes a multi-platform image at
`ghcr.io/rsocko/paperclip:copilot-local-sha-<full-master-sha>` and records a
registry attestation. Deploy the immutable tag together with its resolved
`sha256` manifest digest. The `copilot-local` tag is only a convenience channel
and is not a deployment handoff.

For synthetic authenticated validation:

1. Configure an agent with the `copilot_local` adapter and a secret reference
   for `COPILOT_GITHUB_TOKEN`.
2. Use **Test environment**.
3. Confirm the Node, command, token, and ACP checks pass.
4. Confirm the live probe returns `hello`.
5. Run a disposable task in a test repository and confirm session resume.

The build and synthetic checks never need or read a credential.

## Security tradeoff

Copilot executes inside the Paperclip control-plane container. It inherits the
container user, mounted files, network access, and process trust boundary.
Compromise of the coding agent can therefore affect the control plane and any
resources visible to that container. Limit mounts and network access. Use a
least-privilege GitHub token. Keep ACP permission policy restrictive for
untrusted work.

The read-only adapter directory protects the packaged code from the runtime
user. It does not sandbox Copilot from the rest of the container.

## Upgrade and rollback

To upgrade, review a new upstream commit, update the source commit and archive
checksum, update exact dependency pins and the lock, update the Copilot CLI
pin, run the image assertions, and publish a new full-SHA image.

To roll back, deploy the previous immutable image digest. If the prior image
does not contain this adapter path, remove the `copilot_local` registration
before rollback or reinstall a compatible local path after rollback. Never
deploy the mutable channel tag as a rollback target.
