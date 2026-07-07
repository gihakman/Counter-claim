import React from "react";

/**
 * Docket-stamp mark. Renders as an ink square seal with the slashed C.
 * Used at 36px in the header and 28px in the footer.
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Counterclaim seal"
    >
      <rect x="4" y="4" width="56" height="56" fill="var(--paper)" />
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="3"
      />
      <rect
        x="10"
        y="10"
        width="44"
        height="44"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1"
      />
      <path
        d="M20 42 C20 30, 28 22, 40 22 L44 22"
        stroke="var(--seal)"
        strokeWidth="5"
        strokeLinecap="square"
        fill="none"
      />
      <line
        x1="14"
        y1="50"
        x2="50"
        y2="14"
        stroke="var(--ink)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span>
      <span className="wordmark">Counterclaim</span>
      <span className="subtitle">Validator-issued verdicts</span>
    </span>
  );
}
