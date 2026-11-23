// Inline SVG icons (stroke-based, inherit currentColor).
const svg = (body, size = 20, extra = "") =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  // App mark: a timetable grid where one lesson spans two periods.
  logo: (size = 28) =>
    `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--board)"/>
      <g fill="var(--chalk)">
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
  // Generic "automation" glyph: a card with a play triangle.
  shortcut: (s) =>
    svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none"/>`, s),
  flag: (s) => svg(`<path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5"/>`, s),
  link: (s) =>
    svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`, s),
  close: (s) => svg(`<path d="M6 6l12 12M18 6L6 18"/>`, s),
  refresh: (s) => svg(`<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>`, s),
};
