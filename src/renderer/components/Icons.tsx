import type { ReactNode } from 'react';

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconClipboard = () => (
  <Icon>
    <path d="M5.5 2.75H4.25a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H10.5" />
    <rect x="5.5" y="1.75" width="5" height="2.25" rx=".6" />
  </Icon>
);
export const IconFolder = () => (
  <Icon>
    <path d="M1.75 4.25a1 1 0 0 1 1-1h3.1l1.5 1.5h5.9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" />
  </Icon>
);
export const IconClose = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);
export const IconRetry = () => (
  <Icon>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.77" />
    <path d="M13.25 1.75v3h-3" />
  </Icon>
);
export const IconPlay = () => (
  <Icon>
    <path d="M4.5 2.75v10.5l8.5-5.25z" />
  </Icon>
);
export const IconTrash = () => (
  <Icon>
    <path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4 4.25l.6 9h6.8l.6-9" />
  </Icon>
);
export const IconCheck = () => (
  <Icon>
    <path d="m3 8.5 3.25 3.25L13 4.75" />
  </Icon>
);
export const IconDownload = () => (
  <Icon>
    <path d="M8 2.25v8M4.5 7 8 10.5 11.5 7M2.75 13.5h10.5" />
  </Icon>
);
export const IconSearch = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Icon>
);
export const IconAlert = () => (
  <Icon>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.75v3.75M8 11.2v.05" />
  </Icon>
);

export function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        fill="var(--accent)"
        fillRule="evenodd"
        d="M3 1h17v5H10.5v3.5H18v5h-7.5V21H3zM5 3v2.5h3V3zm0 5v2.5h3V8zm0 5v2.5h3V13zm0 5v1.5h3V18z"
      />
    </svg>
  );
}
