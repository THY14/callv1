// Small inline icons so buttons look the same on every phone/OS (emoji don't).
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const MicIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
  </svg>
);

export const MicOffIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1" />
    <path d="M19 10v1a7 7 0 0 1-1.1 3.8M5 10v1a7 7 0 0 0 11.5 5.4M12 18v4M8 22h8M3 3l18 18" />
  </svg>
);

export const HeadphonesIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
  </svg>
);

export const HeadphonesOffIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M3 18v-6a9 9 0 0 1 15-6.7M21 12v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3zM3 3l18 18" />
  </svg>
);

export const SettingsIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export const VolumeIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M11 5 6 9H2v6h4l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export const HangUpIcon = ({ size = 24 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M12 9c-2.6 0-5.1.5-7.4 1.4-.9.4-1.4 1.2-1.4 2.2v2.1c0 .8.7 1.4 1.5 1.3l3.2-.5c.7-.1 1.2-.7 1.2-1.4v-1.7c1.9-.5 3.9-.5 5.8 0v1.7c0 .7.5 1.3 1.2 1.4l3.2.5c.8.1 1.5-.5 1.5-1.3v-2.1c0-1-.6-1.8-1.4-2.2C17.1 9.5 14.6 9 12 9z" />
  </svg>
);
