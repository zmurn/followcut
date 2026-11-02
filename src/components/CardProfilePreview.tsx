import { useEffect, useState } from 'preact/hooks';
import type { Account } from '../lib/types';
import { Icon } from './Icon';

interface CardProfilePreviewProps {
  account: Account;
  upcoming: Account[];
  enabled: boolean;
}

function embedUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/embed/`;
}

/**
 * Low-resolution, visual-only profile preview inside the active card.
 *
 * A small iframe asks Instagram for the first-party profile embed at a narrow
 * viewport (so Instagram chooses smaller image renditions), then crops/zooms it
 * to the post grid. The iframe is pointer-transparent so the card still swipes.
 *
 * The pool keeps the current profile plus the next one. The hidden iframe loads
 * while the current card is being reviewed, so advancing to the next card does
 * not start a cold Instagram request. The pool is append-only and keyed by
 * username; existing iframe DOM is not reordered or re-created.
 */
export function CardProfilePreview({ account, upcoming, enabled }: CardProfilePreviewProps) {
  const [pool, setPool] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  const upcomingKey = upcoming.map(item => item.username).join('|');

  const activeLoaded = loaded.includes(account.username);

  useEffect(() => {
    if (!enabled) {
      setPool([]);
      return;
    }
    // Load the visible profile first; only start the next request once the
    // current embed has fired load. This keeps the first card from competing
    // with a prefetch it has not reached yet.
    const wanted = activeLoaded
      ? [account.username, ...upcoming.map(item => item.username)]
      : [account.username];
    setPool(previous => {
      const next = previous.filter(username => wanted.includes(username));
      for (const username of wanted) {
        if (!next.includes(username)) next.push(username);
      }
      return next;
    });
  }, [enabled, activeLoaded, account.username, upcomingKey]);

  if (!enabled) return null;
  const active = account.username;

  return (
    <div class="card-preview" aria-label={`Recent Instagram posts from @${account.display}`}>
      <div class="card-preview__head">
        <span><Icon name="cards" size={12} /> Recent posts</span>
        <span>Low-res preview</span>
      </div>
      <div class="card-preview__frame">
        {pool.map(username => (
          <iframe
            key={username}
            data-preview-username={username}
            data-loaded={loaded.includes(username) ? 'true' : 'false'}
            class={`card-preview__iframe${username === active ? ' is-active' : ''}`}
            title={`Instagram preview for @${username}`}
            src={embedUrl(username)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerpolicy="no-referrer"
            tabIndex={-1}
            onLoad={() => setLoaded(previous => previous.includes(username) ? previous : [...previous, username])}
          />
        ))}
        <div class={`card-preview__loading${loaded.includes(active) ? ' is-hidden' : ''}`} role="status" aria-live="polite">
          <span class="skeleton-line" /> Loading preview…
        </div>
      </div>
    </div>
  );
}
