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
