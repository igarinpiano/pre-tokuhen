// Inline SVG icons (stroke-based, inherit currentColor).
const svg = (body, size = 20, extra = "") =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  // App mark: a timetable grid where one lesson spans two periods.
  logo: (size = 28) =>
    `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--ink)"/>
      <g fill="var(--bg)">
        <rect x="7" y="7" width="5" height="5" rx="1.5" opacity=".45"/>
        <rect x="13.5" y="7" width="5" height="11.5" rx="1.5"/>
        <rect x="20" y="7" width="5" height="5" rx="1.5" opacity=".45"/>
        <rect x="7" y="13.5" width="5" height="5" rx="1.5" opacity=".45"/>
        <rect x="20" y="13.5" width="5" height="5" rx="1.5" opacity=".45"/>
        <rect x="7" y="20" width="18" height="5" rx="1.5" opacity=".45"/>
      </g>
    </svg>`,
  calendar: (s) =>
    svg(`<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`, s),
  left: (s) => svg(`<path d="M14.5 6l-6 6 6 6"/>`, s),
  right: (s) => svg(`<path d="M9.5 6l6 6-6 6"/>`, s),
  // Two stacked rounded diamonds; the upper one sits in front.
  shortcut: (s = 20) =>
    `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="9.3" width="11" height="11" rx="3" transform="rotate(45 12 14.8)" fill="currentColor" opacity=".38"/>
      <rect x="6.5" y="3.7" width="11" height="11" rx="3" transform="rotate(45 12 9.2)" fill="currentColor"/>
    </svg>`,
  settings: (s) => svg(`<path d="M9.89 5.11L10.33 2.55L13.67 2.55L14.11 5.11A7.2 7.2 0 0 1 15.38 5.64L17.51 4.14L19.86 6.49L18.36 8.62A7.2 7.2 0 0 1 18.89 9.89L21.45 10.33L21.45 13.67L18.89 14.11A7.2 7.2 0 0 1 18.36 15.38L19.86 17.51L17.51 19.86L15.38 18.36A7.2 7.2 0 0 1 14.11 18.89L13.67 21.45L10.33 21.45L9.89 18.89A7.2 7.2 0 0 1 8.62 18.36L6.49 19.86L4.14 17.51L5.64 15.38A7.2 7.2 0 0 1 5.11 14.11L2.55 13.67L2.55 10.33L5.11 9.89A7.2 7.2 0 0 1 5.64 8.62L4.14 6.49L6.49 4.14L8.62 5.64A7.2 7.2 0 0 1 9.89 5.11Z"/><circle cx="12" cy="12" r="3"/>`, s),
  chevronDown: (s) => svg(`<path d="M6 9.5l6 6 6-6"/>`, s),
  print: (s) =>
    svg(`<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8.5" rx="2.5"/><path d="M7 14h10v6.5H7z"/><path d="M16.5 11.5h.01"/>`, s),
  flag: (s) => svg(`<path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5"/>`, s),
  link: (s) =>
    svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`, s),
  close: (s) => svg(`<path d="M6 6l12 12M18 6L6 18"/>`, s),
  refresh: (s) => svg(`<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>`, s),
};
