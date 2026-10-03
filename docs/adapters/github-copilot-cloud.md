---
title: GitHub Copilot Cloud
summary: Connect Paperclip to GitHub-hosted Copilot coding agent tasks
---

The GitHub Copilot Cloud adapter (`github_copilot_web`) sends Paperclip tasks to
GitHub's hosted Copilot coding agent. Each successful dispatch creates a native
GitHub Agent Task that the responsible user can open on github.com.

## Before you connect

You need:

- a Copilot Business or Copilot Enterprise entitlement;
- Copilot coding agent enabled for the target repository and your GitHub user;
- an existing base branch in the target repository; and
- a user-to-server GitHub credential that can access that repository.

Paperclip supports fine-grained personal access tokens (PATs) and GitHub App user
access tokens. GitHub App installation access tokens are not supported by the
Agent Tasks API.

## Create a fine-grained PAT

When you create the PAT in GitHub:

1. Set the resource owner to the user or organization that owns the repository.
2. Under **Repository access**, select the repository the agent will work in.
3. Under **Repository permissions**, set **Agent tasks** to **Read and write**.
4. Make sure the token's owner can read repository metadata, commits, refs, and
   pull requests. Paperclip uses that access to verify the target and resolve
   branches and pull-request work products.
5. If the organization requires token approval or SAML SSO authorization,
   complete that step before testing the connection.

The token belongs to the responsible Paperclip user. Paperclip saves it as that
user's `GITHUB_TOKEN` secret only after the environment test succeeds. It is not
stored as plaintext adapter configuration or as an organization secret.

## Register the agent

In **Agents → New agent → GitHub Copilot Cloud**:

1. Enter the repository as exact `owner/repo` text.
2. Enter an existing base branch.
3. Paste the PAT, or leave the token field blank to reuse your active
   `GITHUB_TOKEN` user secret.
4. Run **Test environment**.
5. Finish setup after all required checks pass.

The environment test verifies repository access, the base branch, token
permissions, Copilot entitlement, and repository eligibility.

## Confirm a GitHub session is created

Assign a small task to the agent and start the run. After GitHub accepts it,
Paperclip records the provider task ID and a URL similar to
`https://github.com/copilot/tasks/<task-id>`. Open that URL while signed in as
the credential owner to follow the hosted session and respond if the agent is
waiting for input.

If the run fails with `user does not have read access to the repository`, no
GitHub session was created. Check that the PAT includes the exact repository,
that organization approval or SSO authorization is complete, and that the
credential owner can open the repository on github.com.

## Operational limits

GitHub's Agent Tasks API does not currently expose a cancellation endpoint.
Stopping a dispatched run in Paperclip cannot immediately stop the provider
task; Paperclip continues tracking it until GitHub reports a terminal state.
