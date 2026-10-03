import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { formatAgentSetupTestError, testAgentSetup } from "./test-agent-setup";
const testEnvironment = vi.hoisted(() => vi.fn());
vi.mock("../api/agents", () => ({ agentsApi: { testEnvironment } }));
const input = {
  companyId: "company-1",
  agentId: "agent-1",
  adapterType: "paperclip_runner",
  providerAdapter: "claude_local",
  environmentId: "sandbox-1",
  adapterConfig: {
    provider: "acpx",
    acpxAgent: "claude",
    env: {
      ANTHROPIC_API_KEY: {
        type: "user_secret_ref",
        key: "ANTHROPIC_API_KEY",
        version: "latest",
      },
    },
  },
};
const ready = {
  adapterType: "paperclip_runner",
  status: "pass",
  testedAt: "now",
  checks: [{ code: "runtime", level: "info", message: "Ready" }],
};
beforeEach(() => testEnvironment.mockReset());
it("formats sanitized validation issues without exposing other response fields", () => {
  const error = new ApiError("Validation error", 400, {
    error: "Validation error",
    details: [
      {
        code: "too_big",
        path: ["testCredentials", "GITHUB_TOKEN"],
        message: "Must contain at most 16384 characters",
        input: "secret-value-that-must-not-render",
      },
      {
        code: "invalid_type",
        path: ["adapterConfig", "baseRef"],
        message: "Expected string",
      },
    ],
    requestBody: { testCredentials: { GITHUB_TOKEN: "secret-value-that-must-not-render" } },
  });

  const formatted = formatAgentSetupTestError(error);

  expect(formatted).toBe(
    "testCredentials.GITHUB_TOKEN: Must contain at most 16384 characters\nadapterConfig.baseRef: Expected string",
  );
  expect(formatted).not.toContain("secret-value-that-must-not-render");
  expect(formatted).not.toContain("requestBody");
});
it("falls back to the API error message when structured details are unavailable", () => {
  expect(formatAgentSetupTestError(new ApiError("Connection unavailable", 503, null)))
    .toBe("Connection unavailable");
});
it("does not report a connection when runtime readiness passes but provider authentication fails", async () => {
  testEnvironment
    .mockResolvedValueOnce(ready)
    .mockResolvedValueOnce({
      ...ready,
      adapterType: "claude_local",
      status: "fail",
      checks: [
        {
          code: "claude_hello_probe_failed",
          level: "error",
          message: "Invalid API key",
        },
      ],
    });
  const result = await testAgentSetup(input);
  expect(result.status).toBe("fail");
  expect(result.adapterType).toBe("paperclip_runner");
  expect(testEnvironment).toHaveBeenLastCalledWith(
    "company-1",
    "claude_local",
    {
      agentId: "agent-1",
      environmentId: "sandbox-1",
      adapterConfig: { ...input.adapterConfig, engine: "cli" },
    },
  );
  expect(result.checks.map((check) => check.code)).toEqual([
    "runtime",
    "claude_hello_probe_failed",
  ]);
});
it("probes native Grok credentials with the pinned prerequisite in the selected sandbox", async () => {
  testEnvironment.mockResolvedValueOnce(ready).mockResolvedValueOnce({ ...ready,
    checks: [{ code: "grok_hello_probe_passed", level: "info", message: "Hello" }],
  });
  const result = await testAgentSetup({ ...input, providerAdapter: "grok_local",
    adapterConfig: { provider: "acpx", acpxAgent: "grok", model: "grok-4.7" },
  });
  expect(testEnvironment).toHaveBeenLastCalledWith("company-1", "grok_local", {
    agentId: "agent-1", environmentId: "sandbox-1",
    adapterConfig: { provider: "acpx", acpxAgent: "grok", model: "grok-4.7", engine: "cli", command: "/opt/paperclip/providers/grok/1.0.13/grok" },
  });
  expect(result.checks.some((check) => check.code === "grok_hello_probe_passed")).toBe(true);
});
it("does not repeat a completed model probe", async () => {
  testEnvironment.mockResolvedValue({
    ...ready,
    checks: [
      { code: "codex_hello_probe_passed", level: "info", message: "Hello" },
    ],
  });
  await testAgentSetup({
    ...input,
    adapterType: "codex_local",
    providerAdapter: "codex_local",
  });
  expect(testEnvironment).toHaveBeenCalledTimes(1);
});
it("preserves runtime warnings after a successful provider request", async () => {
  testEnvironment
    .mockResolvedValueOnce({ ...ready, status: "warn" })
    .mockResolvedValueOnce(ready);
  expect((await testAgentSetup(input)).status).toBe("warn");
});
