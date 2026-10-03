import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "./test.js";

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("github_copilot_web testEnvironment", () => {
  it("describes a missing baseRef as a missing base branch", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "github_copilot_web",
      config: {
        repository: "octo/repo",
        env: { GITHUB_TOKEN: { type: "plain", value: "resolved-user-token" } },
      },
    });

    expect(result.checks).toContainEqual({
      code: "github_copilot_web_base_ref_missing",
      level: "error",
      message: "Base branch is required.",
    });
  });

  it("passes valid resolved setup while reporting cancellation as information", async () => {
    vi.stubGlobal("fetch", vi.fn(async (request: string | URL | Request) => {
      const url = String(request);
      if (url.endsWith("/repos/octo/repo")) {
        return json({ id: 101, full_name: "octo/repo", default_branch: "main" });
      }
      if (url.includes("/git/ref/heads/main")) {
        return json({ object: { sha: "base-sha" } });
      }
      if (url.endsWith("/graphql")) {
        return json({
          data: {
            repository: {
              id: "R_repo",
              suggestedActors: {
                nodes: [{ __typename: "Bot", id: "BOT_copilot", login: "copilot-swe-agent" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "github_copilot_web",
      config: {
        repository: "octo/repo",
        baseRef: "main",
        env: { GITHUB_TOKEN: { type: "plain", value: "resolved-user-token" } },
      },
    });

    expect(result.status).toBe("pass");
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "github_copilot_web_repository_ok", level: "info" }),
      expect.objectContaining({ code: "github_copilot_web_entitlement_ok", level: "info" }),
      expect.objectContaining({ code: "github_copilot_web_cancellation_unavailable", level: "info" }),
    ]));
  });
});
