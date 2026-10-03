import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { ADAPTER_AUTH_MISSING_CHECK_CODE } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { ApiError } from "../api/client";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeIssuePath(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const segments = value.flatMap((segment) => {
    if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) {
      return [String(segment)];
    }
    if (typeof segment === "string" && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(segment)) {
      return [segment];
    }
    return [];
  });
  return segments.length === value.length ? segments.join(".") : null;
}

export function formatAgentSetupTestError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = record(error.body)?.details;
    if (Array.isArray(details)) {
      const messages = details.flatMap((detail) => {
        const issue = record(detail);
        if (!issue || typeof issue.message !== "string" || !issue.message.trim()) return [];
        const path = safeIssuePath(issue.path);
        return [`${path ? `${path}: ` : ""}${issue.message.trim()}`];
      });
      const uniqueMessages = [...new Set(messages)].slice(0, 5);
      if (uniqueMessages.length > 0) return uniqueMessages.join("\n");
    }
  }
  return error instanceof Error ? error.message : "Could not test the agent.";
}

/** ACP readiness checks do not authenticate a provider. Verify credentials with
 * the adapter's existing read-only CLI hello probe before calling setup connected. */
export async function testAgentSetup(input: {
  companyId: string;
  agentId?: string;
  adapterType: string;
  providerAdapter: string;
  adapterConfig: Record<string, unknown>;
  aiConnection?: import("@paperclipai/shared").AiConnectionBinding;
  testCredentials?: Record<string, string>;
  environmentId: string | null;
}): Promise<AdapterEnvironmentTestResult> {
  const payload = {
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.aiConnection ? { aiConnection: input.aiConnection } : {}),
    adapterConfig: input.adapterConfig,
    ...(input.testCredentials ? { testCredentials: input.testCredentials } : {}),
    environmentId: input.environmentId,
  };
  const runtime = await agentsApi.testEnvironment(
    input.companyId,
    input.adapterType,
    payload,
  );
  if (
    runtime.status === "fail" ||
    runtime.checks.some(
      (check) => check.code === ADAPTER_AUTH_MISSING_CHECK_CODE,
    ) ||
    runtime.checks.some((check) => check.code.includes("hello_probe")) ||
    !["claude_local", "codex_local", "grok_local"].includes(input.providerAdapter)
  )
    return runtime;
  const provider = await agentsApi.testEnvironment(
    input.companyId,
    input.providerAdapter,
    {
      ...payload,
      adapterConfig: {
        ...input.adapterConfig,
        engine: "cli",
        ...(input.adapterType === "paperclip_runner" && input.providerAdapter === "grok_local"
          ? { command: "/opt/paperclip/providers/grok/1.0.13/grok" }
          : {}),
      },
    },
  );
  const checks = [
    ...new Map(
      [...runtime.checks, ...provider.checks].map((check) => [
        check.code,
        check,
      ]),
    ).values(),
  ];
  return {
    adapterType: input.adapterType,
    testedAt: provider.testedAt,
    status:
      provider.status === "fail"
        ? "fail"
        : runtime.status === "warn" || provider.status === "warn"
          ? "warn"
          : "pass",
    checks,
  };
}
