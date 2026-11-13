/** Line icons (24px grid, drawn with the .ic class: stroke only). */
const P: Record<string, string> = {
  basket: 'M5 9h14l-1.4 9.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5 9Zm3 0 3-5m5 5-3-5M3 9h18',
  scan: 'M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm9 16-4-4',
  scale: 'M12 4v3M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7Zm10 0-3 7a3 3 0 0 0 6 0l-3-7ZM8 20h8M12 7v13',
  x: 'M6 6l12 12M18 6 6 18',
  times: 'M7 7l10 10M17 7 7 17',
  tag: 'M3 12V4h8l9 9-8 8-9-9Zm5-4.5a1 1 0 1 0 0 .01',
  pause: 'M9 5v14M15 5v14',
  stack: 'M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM6 10v.01M18 14v.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  print: 'M7 9V4h10v5M7 17H5v-7h14v7h-2M7 14h10v6H7z',
  check: 'M5 12.5 10 17 19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  home: 'M4 11 12 4l8 7v9H4z M10 20v-5h4v5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6M9 16h3',
  clock: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4v4l3 2',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a5 5 0 0 1 3 6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cog: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm7.4 6a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  person: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  del: 'M20 7H9l-5 5 5 5h11zM12 10l4 4M16 10l-4 4',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  alert: 'M12 4 2 20h20L12 4Zm0 6v4m0 3v.01',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
};

export function Icon({ n, sm, style }: { n: keyof typeof P | string; sm?: boolean; style?: React.CSSProperties }) {
  return (
    <svg className={sm ? 'ic sm' : 'ic'} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path d={P[n] ?? ''} />
    </svg>
  );
}
