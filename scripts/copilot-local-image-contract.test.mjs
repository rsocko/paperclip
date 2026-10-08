import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const workflow = readFileSync(
  new URL("../.github/workflows/copilot-local-image.yml", import.meta.url),
  "utf8",
);
const imageAssertion = readFileSync(
  new URL("./assert-copilot-local-image.sh", import.meta.url),
  "utf8",
);
const expectedCopilotModels = [
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
];

test("merged master publishes an immutable multi-platform Copilot image", () => {
  assert.match(workflow, /branches:\s*\n\s+- master/);
  assert.match(workflow, /IMMUTABLE_TAG: copilot-local-sha-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /platform: linux\/amd64/);
  assert.match(workflow, /platform: linux\/arm64/);
  assert.match(workflow, /subject-digest: \$\{\{ steps\.image\.outputs\.digest \}\}/);
});

test("the Copilot image retains production and installs the local adapter", () => {
  assert.match(dockerfile, /FROM production AS copilot-local/);
  assert.match(
    dockerfile,
    /COPY --from=copilot-local-adapter-build \/tmp\/copilot-local-adapter \/opt\/paperclip\/adapters\/copilot-local/,
  );
  assert.match(dockerfile, /"@github\/copilot@\$\{COPILOT_CLI_VERSION\}"/);
  const declaredModelsJson = dockerfile.match(/PAPERCLIP_ADAPTER_MODELS='([^']+)'/)?.[1];
  assert.ok(declaredModelsJson, "Copilot image must declare PAPERCLIP_ADAPTER_MODELS");
  const declaredModels = JSON.parse(declaredModelsJson).copilot_local;
  assert.deepEqual(
    declaredModels.map((model) => model.id),
    expectedCopilotModels,
  );
  assert.match(imageAssertion, /adapter\.type !== "copilot_local"/);
  assert.match(imageAssertion, /adapter\.acp\?\.agentId !== "copilot"/);
  assert.match(imageAssertion, /field\.key === "contextTier"/);
  assert.match(imageAssertion, /reasoningEffort: "high"/);
  assert.match(imageAssertion, /contextTier: "long_context"/);
});
