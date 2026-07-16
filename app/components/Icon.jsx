"use client";

// Единичен inline-SVG icon компонент. Използваме реални икони вместо emoji.
// Всички икони наследяват currentColor и са 1.75px stroke за спокоен, институционален вид.

const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  bookmark: <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />,
  bookmarkFilled: (
    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" fill="currentColor" stroke="none" />
  ),
  compare: (
    <>
      <rect x="3" y="4.5" width="7.5" height="15" rx="1.5" />
      <rect x="13.5" y="4.5" width="7.5" height="15" rx="1.5" />
    </>
  ),
  link: (
    <>
      <path d="M9 15 15 9" />
      <path d="M11 6.5 12.6 5a4 4 0 0 1 5.7 5.7L16.5 12.5" />
      <path d="M12.5 17.5 11 19a4 4 0 0 1-5.7-5.7L7 11.5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  download: <><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 21h16" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  close: <><path d="M6 6 18 18" /><path d="M18 6 6 18" /></>,
  check: <path d="m5 12 5 5 9-11" />,
  sort: <><path d="M7 4v16" /><path d="m3.5 8 3.5-4 3.5 4" /><path d="M17 20V4" /><path d="m13.5 16 3.5 4 3.5-4" /></>,
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M17 20a5.5 5.5 0 0 0-2.5-4.6" />
    </>
  ),
  euro: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5A4.5 4.5 0 1 0 15.5 15.5" /><path d="M7.5 11h6M7.5 13.5h5" /></>,
  document: <><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M13 3v5h5" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-.5 4" /><path d="M20 4v7h-7" /></>,
  sparkle: <path d="M12 3 13.8 9.2 20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" />,
  alert: <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 10v4.5" /><path d="M12 17.5h.01" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" /><path d="M10 21v-3h4v3" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 14h10v6H7z" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
};

export default function Icon({ name, size = 18, className = "", strokeWidth = 1.75, title, ...rest }) {
  const path = PATHS[name];
  return (
    <svg
      className={"icon " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {path || null}
    </svg>
  );
}
