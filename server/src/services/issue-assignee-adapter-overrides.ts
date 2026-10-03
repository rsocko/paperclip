const TASK_ADAPTER_CONFIG_KEYS: Readonly<Record<string, readonly string[]>> = {
  claude_local: ["model", "effort"],
  codex_local: ["model", "modelReasoningEffort"],
  copilot_local: ["model", "reasoningEffort"],
  opencode_local: ["model", "variant"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function taskAdapterConfigOverrides(
  adapterType: string,
  value: unknown,
): Record<string, unknown> | null {
  const allowedKeys = TASK_ADAPTER_CONFIG_KEYS[adapterType];
  if (!allowedKeys || !isRecord(value)) return null;

  const overrides = Object.fromEntries(
    allowedKeys
      .filter((key) => typeof value[key] === "string" && value[key].trim().length > 0)
      .map((key) => [key, value[key]]),
  );
  return Object.keys(overrides).length > 0 ? overrides : null;
}
