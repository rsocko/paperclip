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
      <path
        d="M12 .7C5.73.7.65 5.78.65 12.05c0 5.02 3.26 9.28 7.78 10.78.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.1-3.17.69-3.84-1.34-3.84-1.34-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.53-.29-5.2-1.27-5.2-5.63 0-1.24.44-2.26 1.17-3.06-.12-.29-.51-1.47.11-3.02 0 0 .96-.31 3.13 1.17a10.9 10.9 0 0 1 5.7 0c2.17-1.48 3.13-1.17 3.13-1.17.62 1.55.23 2.73.11 3.02.73.8 1.17 1.82 1.17 3.06 0 4.37-2.67 5.33-5.21 5.61.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55a11.39 11.39 0 0 0 7.77-10.78C23.35 5.78 18.27.7 12 .7Z"
        fill="var(--adapter-copilot-anchor)"
        transform="translate(3.15 3.15) scale(.56)"
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
        x="11.25"
        y="13.5"
        width="12"
        height="9"
        rx="2"
        fill="var(--adapter-copilot-console)"
        stroke="var(--adapter-copilot-local-accent)"
        strokeWidth="1.5"
      />
      <path
        d="m13.5 16 1.6 1.4-1.6 1.4"
        stroke="var(--adapter-copilot-prompt)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 19h3"
        stroke="var(--adapter-copilot-prompt)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GitHubCopilotCloudIcon({ className }: CopilotAdapterIconProps) {
  const cloudPath =
    "M12.25 20h7.4a2.85 2.85 0 0 0 .38-5.68 4.15 4.15 0 0 0-7.79-1.23A3.48 3.48 0 0 0 12.25 20Z";

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
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={cloudPath}
        stroke="var(--adapter-copilot-cloud-accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
