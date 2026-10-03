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
  assert.match(imageAssertion, /adapter\.type !== "copilot_local"/);
  assert.match(imageAssertion, /adapter\.acp\?\.agentId !== "copilot"/);
});
