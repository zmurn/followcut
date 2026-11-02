export type IconName =
  | 'cut' | 'keep' | 'maybe' | 'star' | 'lock' | 'unlock'
  | 'arrow-left' | 'arrow-right' | 'arrow-down' | 'arrow-up'
  | 'external' | 'upload' | 'folder' | 'file' | 'shield' | 'shield-check'
  | 'check' | 'x' | 'search' | 'sun' | 'moon' | 'help' | 'alert' | 'info'
  | 'copy' | 'download' | 'trash' | 'refresh' | 'list' | 'cards' | 'queue'
  | 'chevron-left' | 'chevron-right' | 'eye' | 'undo' | 'dashboard'
  | 'settings' | 'filter' | 'note' | 'database' | 'spark' | 'play' | 'phone';

interface IconProps {
  name: IconName;
  size?: number;
  filled?: boolean;
  class?: string;
  title?: string;
}

export function Icon({ name, size = 18, filled = false, class: className, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths(name, filled)}
    </svg>
  );
}

function paths(name: IconName, filled: boolean) {
  switch (name) {
    case 'cut':
      return (
        <>
          <circle cx="6" cy="6" r="2.6" />
          <circle cx="6" cy="18" r="2.6" />
          <path d="M20 4 8.2 15.8" />
          <path d="M14.6 14.6 20 20" />
          <path d="M8.2 8.2 11.6 11.6" />
        </>
      );
    case 'keep':
      return <path d="M19 21l-7-4.7L5 21V5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5Z" />;
    case 'maybe':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 1.8" />
        </>
      );
    case 'star':
      return <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" />;
    case 'lock':
      return (
        <>
          <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      );
    case 'unlock':
      return (
        <>
          <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 7.7-1.5" />
        </>
      );
    case 'arrow-left':
      return (
        <>
          <path d="M20 12H4" />
          <path d="m10 6-6 6 6 6" />
        </>
      );
    case 'arrow-right':
      return (
        <>
          <path d="M4 12h16" />
          <path d="m14 6 6 6-6 6" />
        </>
      );
    case 'arrow-down':
      return (
        <>
          <path d="M12 4v16" />
          <path d="m6 14 6 6 6-6" />
        </>
      );
    case 'arrow-up':
      return (
        <>
          <path d="M12 20V4" />
          <path d="m6 10 6-6 6 6" />
        </>
      );
    case 'external':
      return (
        <>
          <path d="M14 3h7v7" />
          <path d="M10 14 21 3" />
          <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </>
      );
    case 'upload':
      return (
        <>
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </>
      );
    case 'folder':
      return <path d="M3.5 6.5A2 2 0 0 1 5.5 4.5h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />;
    case 'file':
      return (
        <>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
          <path d="M14 3v6h6" />
        </>
      );
    case 'shield':
      return <path d="M12 21c4.5-2.1 7-5.5 7-9.7V5.5L12 3 5 5.5v5.8C5 15.5 7.5 18.9 12 21Z" />;
    case 'shield-check':
      return (
        <>
          <path d="M12 21c4.5-2.1 7-5.5 7-9.7V5.5L12 3 5 5.5v5.8C5 15.5 7.5 18.9 12 21Z" />
          <path d="m9 11.5 2 2 4-4" />
        </>
      );
    case 'check':
      return <path d="m4.5 12.5 5 5 10-11" />;
    case 'x':
      return (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4.5 4.5" />
        </>
      );
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </>
      );
    case 'moon':
      return <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />;
    case 'help':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.7.3-.9.8-.9 1.4v.5" />
          <path d="M12 17h.01" />
        </>
      );
    case 'alert':
      return (
        <>
          <path d="M12 3 2.8 20h18.4Z" />
          <path d="M12 9v5" />
          <path d="M12 17.5h.01" />
        </>
      );
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </>
      );
    case 'copy':
      return (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </>
      );
    case 'download':
      return (
        <>
          <path d="M12 4v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M4 19.5h16" />
        </>
      );
    case 'trash':
      return (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V4.5h6V7" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v5M14 11v5" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M6.1 8A7.5 7.5 0 0 1 19.3 9.5" />
          <path d="M17.9 16A7.5 7.5 0 0 1 4.7 14.5" />
        </>
      );
    case 'list':
      return (
        <>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </>
      );
    case 'cards':
      return (
        <>
          <rect x="7" y="3.5" width="14" height="17" rx="2.5" />
          <path d="M3 7v11a2.5 2.5 0 0 0 2.5 2.5H13" />
        </>
      );
    case 'queue':
      return (
        <>
          <path d="M4 6.5h9M4 12h9M4 17.5h6" />
          <path d="m16 16.5 2 2 3.5-4" />
        </>
      );
    case 'chevron-left':
      return <path d="m14.5 5-7 7 7 7" />;
    case 'chevron-right':
      return <path d="m9.5 5 7 7-7 7" />;
    case 'eye':
      return (
        <>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case 'undo':
      return (
        <>
          <path d="M4 10h9a5.5 5.5 0 1 1 0 11H8" />
          <path d="m8 5-5 5 5 5" />
        </>
      );
    case 'dashboard':
      return (
        <>
          <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
          <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
          <rect x="13.5" y="12.5" width="7" height="8" rx="1.5" />
        </>
      );
    case 'settings':
      return (
        <>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </>
      );
    case 'filter':
      return <path d="M3.5 5h17l-6.5 7.5V20l-4 1.5v-9Z" />;
    case 'note':
      return (
        <>
          <path d="M5 4h14v11l-5 5H5Z" />
          <path d="M14 20v-5h5" />
          <path d="M8 8h8M8 12h5" />
        </>
      );
    case 'database':
      return (
        <>
          <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
          <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13" />
          <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
        </>
      );
    case 'spark':
      return (
        <>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <path d="m6.2 6.2 2.2 2.2M15.6 15.6l2.2 2.2M6.2 17.8l2.2-2.2M15.6 8.4l2.2-2.2" />
        </>
      );
    case 'play':
      return <path d="m8 5 11 7-11 7Z" fill={filled ? 'currentColor' : 'none'} />;
    case 'phone':
      return (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path d="M10.5 18.5h3" />
        </>
      );
    default:
      return null;
  }
}
