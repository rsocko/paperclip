#!/bin/sh
set -eu

adapter_path=/opt/paperclip/adapters/copilot-local
expected_cli_version="${COPILOT_CLI_VERSION:-1.0.90}"
expected_source_commit="${COPILOT_ADAPTER_SOURCE_COMMIT:-69a2c6e399d342ce59cc7d3d27084d936b55a705}"

test -d "$adapter_path"
test "$(cat "$adapter_path/SOURCE_COMMIT")" = "$expected_source_commit"
test "$(node -p "require('$adapter_path/package.json').version")" = "0.1.0"
test "$(node -p "require('$adapter_path/node_modules/@paperclipai/adapter-utils/package.json').version")" = "2026.722.0"

copilot_version="$(copilot --version)"
printf '%s\n' "$copilot_version" | grep -F "$expected_cli_version" >/dev/null
copilot --help | grep -F -- "--acp" >/dev/null

node --input-type=module - "$adapter_path" <<'EOF'
import path from "node:path";
import { pathToFileURL } from "node:url";

const adapterPath = process.argv[2];
const module = await import(pathToFileURL(path.join(adapterPath, "dist/index.js")));
if (typeof module.createServerAdapter !== "function") {
  throw new Error("Adapter does not export createServerAdapter()");
}
const adapter = module.createServerAdapter();
if (adapter.type !== "copilot_local" || adapter.acp?.agentId !== "copilot") {
  throw new Error("Adapter server surface is invalid");
}
const contextTier = adapter.getConfigSchema?.().fields.find((field) => field.key === "contextTier");
if (
  contextTier?.type !== "select" ||
  !contextTier.options?.some((option) => option.value === "default") ||
  !contextTier.options?.some((option) => option.value === "long_context")
) {
  throw new Error("Adapter schema does not expose both Copilot context window tiers");
}
const command = module.buildCopilotAcpCommand({});
for (const flag of ["--acp", "--stdio", "--no-auto-update", "--no-remote", "--no-remote-export"]) {
  if (!command.includes(flag)) throw new Error(`ACP command is missing ${flag}`);
}
const configuredCommand = module.buildCopilotAcpCommand({
  model: "gpt-6.1-sol",
  reasoningEffort: "high",
  contextTier: "long_context",
});
for (const value of ["--model", "gpt-6.1-sol", "--effort", "high", "--context", "long_context"]) {
  if (!configuredCommand.includes(value)) {
    throw new Error(`Configured ACP command is missing ${value}`);
  }
}
EOF

node -e '
const declared = JSON.parse(process.env.PAPERCLIP_ADAPTER_MODELS);
const models = declared.copilot_local;
for (const id of [
  "auto",
  "claude-haiku-5.5",
  "claude-haiku-4.5",
  "claude-opus-5.5",
  "claude-opus-5",
  "claude-opus-4.8",
  "claude-sonnet-5.5",
  "claude-sonnet-5",
  "gpt-6.1-sol",
  "gpt-6-astra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-sol-fast",
  "gpt-5.6-terra",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5-mini",
  "mai-code-1.1-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "grok-4.7",
  "grok-4.6",
  "grok-4.5",
]) {
  if (!models.some((model) => model.id === id)) throw new Error(`Missing declared Copilot model: ${id}`);
}
'

for command in git gh ssh; do
  command -v "$command" >/dev/null
done
test -f /etc/ssl/certs/ca-certificates.crt

for excluded in chromium chromium-browser google-chrome playwright terraform tofu kubectl helm ansible; do
  if command -v "$excluded" >/dev/null 2>&1; then
    echo "Excluded tool is present: $excluded" >&2
    exit 1
  fi
done

if find "$adapter_path" \( -type f -o -type d \) -perm /022 -print -quit | grep -q .; then
  echo "Adapter path contains group- or world-writable entries" >&2
  exit 1
fi
