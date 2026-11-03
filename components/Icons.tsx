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

export const PhoneIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </svg>
);

export const TabletIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="2" width="16" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </svg>
);

export const DesktopIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

/** Small grey phone/tablet/desktop icon shown next to a person's name. */
export const DeviceIcon = ({ device, size = 14 }: { device?: string; size?: number }) => {
  const label = device === "mobile" ? "On phone" : device === "tablet" ? "On tablet" : "On desktop";
  const Icon = device === "mobile" ? PhoneIcon : device === "tablet" ? TabletIcon : DesktopIcon;
  return (
    <span className="device-icon" title={label} aria-label={label}>
      <Icon size={size} />
    </span>
  );
};

export const HangUpIcon = ({ size = 24 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M12 9c-2.6 0-5.1.5-7.4 1.4-.9.4-1.4 1.2-1.4 2.2v2.1c0 .8.7 1.4 1.5 1.3l3.2-.5c.7-.1 1.2-.7 1.2-1.4v-1.7c1.9-.5 3.9-.5 5.8 0v1.7c0 .7.5 1.3 1.2 1.4l3.2.5c.8.1 1.5-.5 1.5-1.3v-2.1c0-1-.6-1.8-1.4-2.2C17.1 9.5 14.6 9 12 9z" />
  </svg>
);

export const LinkIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

export const CopyIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

export const PlusIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CallIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);

export const ChatIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.6A8 8 0 1 1 21 12z" />
  </svg>
);

export const HomeIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const HashIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" />
  </svg>
);

export const ShareIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3v13M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);

export const KeypadIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6" />
  </svg>
);

export const ChevronIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
