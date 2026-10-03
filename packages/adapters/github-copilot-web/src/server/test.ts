import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { GitHubAgentTasksClient } from "./client.js";

function status(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function envMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parseObject(value)).flatMap(([key, entry]) => {
      if (typeof entry === "string") return [[key, entry]];
      const binding = parseObject(entry);
      return binding.type === "plain" && typeof binding.value === "string"
        ? [[key, binding.value]]
        : [];
    }),
  );
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const token = asString(envMap(config.env).GITHUB_TOKEN, "").trim();
  const repository = asString(config.repository, "").trim();
  const baseRef = asString(config.baseRef, "").trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
  if (!token) {
    checks.push({
      code: "github_copilot_web_user_token_missing",
      level: "error",
      message: "A user-to-server GITHUB_TOKEN is required.",
      hint: "Bind GITHUB_TOKEN to a required user secret. Installation tokens are not supported.",
    });
  }
  if (!match) {
    checks.push({
      code: "github_copilot_web_repository_invalid",
      level: "error",
      message: "Repository must be an exact owner/repo value.",
    });
  }
  if (!baseRef) {
    checks.push({
      code: "github_copilot_web_base_ref_missing",
      level: "error",
      message: "Base branch is required.",
    });
  }
  if (token && match && baseRef) {
    const client = new GitHubAgentTasksClient(token);
    try {
      const repo = await client.getRepository(match[1]!, match[2]!);
      await client.getRef(match[1]!, match[2]!, baseRef);
      const eligibility = await client.getCopilotEligibility(match[1]!, match[2]!);
      checks.push({
        code: "github_copilot_web_repository_ok",
        level: "info",
        message: `Verified ${repo.full_name} at ${baseRef}.`,
      });
      checks.push(eligibility.copilotActorId
        ? {
            code: "github_copilot_web_entitlement_ok",
            level: "info",
            message: "GitHub Copilot is enabled for this user and repository.",
          }
        : {
            code: "github_copilot_web_entitlement_missing",
            level: "error",
            message: "GitHub Copilot is not enabled for this user and repository.",
            hint: "Verify Copilot Business/Enterprise entitlement, repository policy, and Agent tasks permissions.",
          });
    } catch (error) {
      checks.push({
        code: "github_copilot_web_probe_failed",
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  checks.push({
    code: "github_copilot_web_cancellation_unavailable",
    level: "info",
    message: "GitHub currently documents no Agent Tasks cancellation endpoint.",
    detail: "Paperclip Stop remains pending while the adapter reconciles the provider to a terminal state.",
  });
  return {
    adapterType: ctx.adapterType,
    status: status(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
