/** Small line icons for the admin, drawn on a 24px grid at a 1.6 stroke. Decorative: aria-hidden. */
type P = { size?: number; className?: string };

function Svg({ size = 16, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <path d="M13.5 17h7M17 13.5v7" />
  </Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
  </Svg>
);
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M4 5.5h16v10H9l-5 4v-14z" />
  </Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
  </Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);
export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 2h-15l1.5-2zM10 20.5a2 2 0 004 0" />
  </Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12.5l4.5 4.5 10.5-11" />
  </Svg>
);
export const IconNote = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5h9l3.5 3.5v13.5H6z" />
    <path d="M9 11h6M9 14.5h6M9 18h3.5" />
  </Svg>
);
export const IconUserPlus = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.4 0 2.7.4 3.7 1M18 13v6M15 16h6" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5H6.5v15H14M10 12h10M17 8.5l3.5 3.5-3.5 3.5" />
  </Svg>
);
export const IconCoins = (p: P) => (
  <Svg {...p}>
    <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
    <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7M3.5 11v4c0 1.4 2.5 2.5 5.5 2.5 1 0 1.9-.1 2.7-.3" />
    <ellipse cx="16.5" cy="15" rx="4.5" ry="2" />
    <path d="M12 15v3c0 1.1 2 2 4.5 2s4.5-.9 4.5-2v-3" />
  </Svg>
);
export const IconMemory = (p: P) => (
  <Svg {...p}>
    <path d="M9 4.5a3 3 0 00-3 3 3 3 0 00-1.5 5.3A3 3 0 007 18a2.5 2.5 0 005 0V7a2.5 2.5 0 00-3-2.5zM15 4.5a3 3 0 013 3 3 3 0 011.5 5.3A3 3 0 0117 18a2.5 2.5 0 01-5 0" />
  </Svg>
);
export const IconTimeline = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h18" />
    <circle cx="7" cy="12" r="2.2" />
    <circle cx="17" cy="12" r="2.2" />
    <path d="M7 9.8V5M17 14.2V19" />
  </Svg>
);
export const IconStar = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l1.9 5.6L19.5 9l-4.5 3.5 1.6 5.6L12 14.9l-4.6 3.2L9 12.5 4.5 9l5.6-.4L12 3z" />
  </Svg>
);
