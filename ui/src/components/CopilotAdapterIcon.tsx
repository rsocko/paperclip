import { GithubIcon } from "@/components/icons/github-icon";
import type { CSSProperties } from "react";

interface CopilotAdapterIconProps {
  className?: string;
}

function CopilotIdentityAnchor() {
  return (
    <>
      <circle
        cx="9.5"
        cy="9.5"
        r="8.25"
        stroke="var(--adapter-copilot-mode-accent)"
        strokeWidth="1.75"
      />
      <GithubIcon
        x="4"
        y="4"
        width="11"
        height="11"
        strokeWidth="2"
        color="var(--adapter-copilot-anchor)"
      />
    </>
  );
}

export function GitHubCopilotCliIcon({ className }: CopilotAdapterIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-adapter-icon="github-copilot-cli"
      style={{ "--adapter-copilot-mode-accent": "var(--adapter-copilot-local-accent)" } as CSSProperties}
    >
      <CopilotIdentityAnchor />
      <rect
        x="8.5"
        y="10.25"
        width="14.5"
        height="12.25"
        rx="2.5"
        fill="var(--adapter-copilot-console)"
        stroke="var(--adapter-copilot-local-accent)"
        strokeWidth="1.75"
      />
      <path
        d="m11.25 14.25 2.25 2-2.25 2"
        stroke="var(--adapter-copilot-prompt)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.75 18.25h3.75"
        stroke="var(--adapter-copilot-prompt)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GitHubCopilotCloudIcon({ className }: CopilotAdapterIconProps) {
  const cloudPath =
    "M10.25 19h8.4a3.35 3.35 0 0 0 .45-6.67 4.85 4.85 0 0 0-9.13-1.44A4.08 4.08 0 0 0 10.25 19Z";

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-adapter-icon="github-copilot-cloud"
      style={{ "--adapter-copilot-mode-accent": "var(--adapter-copilot-cloud-accent)" } as CSSProperties}
    >
      <CopilotIdentityAnchor />
      <path
        d={cloudPath}
        stroke="var(--background)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={cloudPath}
        stroke="var(--adapter-copilot-cloud-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
