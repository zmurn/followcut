import type { Account, Decision, Snapshot } from '../lib/types';
import type { ComponentChildren, HTMLAttributes } from 'preact';
import { followAge, followBackLabel, followedOn, formatDateShort, initials, statusFor } from '../lib/selectors';
import type { ReadState } from '../lib/selectors';
import { Icon } from './Icon';
import { CardProfilePreview } from './CardProfilePreview';

export interface CardStamps {
  cut: number;
  keep: number;
  maybe: number;
}

interface AccountCardProps {
  state: ReadState;
  account: Account;
  decision?: Decision;
  snapshot: Snapshot;
  profileOpenedAt?: string;
  index: number;
  total: number;
  stamps?: CardStamps;
  style?: HTMLAttributes<HTMLElement>['style'];
  class?: string;
  onStar: () => void;
  onLock: () => void;
  onOpenProfile: () => void;
  previewEnabled: boolean;
  upcoming: Account[];
  onPointerDown?: (event: PointerEvent) => void;
  onPointerMove?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onPointerCancel?: (event: PointerEvent) => void;
}

export function AccountCard({
  state,
  account,
  decision,
  snapshot,
  profileOpenedAt,
  index,
  total,
  stamps,
  style,
  class: extraClass = '',
  onStar,
  onLock,
  onOpenProfile,
  previewEnabled,
  upcoming,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
}: AccountCardProps) {
  const status = statusFor(state, account);
  const followBack = followBackLabel(account, snapshot);
  const followBackClass = followBack.tone === 'notback'
    ? 'badge--accent'
    : followBack.tone === 'mutual'
      ? 'badge--outline'
      : 'badge--muted';
  const statusClass = status.tone === 'confirmed'
    ? 'badge--confirm'
    : status.tone === 'queued'
      ? 'badge--accent'
      : 'badge--muted';

  return (
    <article
      class={`deck-card${previewEnabled ? ' has-preview' : ''} ${extraClass}`}
      style={style}
      aria-label={`${account.display}, card ${index} of ${total}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span class="deck-stamp deck-stamp--cut" style={{ opacity: stamps?.cut ?? 0 }} aria-hidden="true">Cut</span>
      <span class="deck-stamp deck-stamp--keep" style={{ opacity: stamps?.keep ?? 0 }} aria-hidden="true">Keep</span>
      <span class="deck-stamp deck-stamp--maybe" style={{ opacity: stamps?.maybe ?? 0 }} aria-hidden="true">Maybe</span>

      <div class="deck-card__top">
        <div class="deck-index">
          Card <b>{String(index).padStart(3, '0')}</b> / {String(total).padStart(3, '0')}
        </div>
        <div class="deck-card__toggles">
          <button
            type="button"
            class="icon-btn"
            aria-pressed={Boolean(decision?.favorite)}
            aria-label={decision?.favorite ? `Unstar ${account.display}` : `Star ${account.display}`}
            title={decision?.favorite ? 'Starred — unstar' : 'Star this account'}
            onClick={onStar}
          >
            <Icon name="star" size={17} filled={Boolean(decision?.favorite)} />
          </button>
          <button
            type="button"
            class="icon-btn"
            aria-pressed={Boolean(decision?.protected)}
            aria-label={decision?.protected ? `Unlock ${account.display}` : `Lock ${account.display}`}
            title={decision?.protected ? 'Locked against bulk operations — unlock' : 'Lock against bulk operations'}
            onClick={onLock}
          >
            <Icon name={decision?.protected ? 'lock' : 'unlock'} size={17} />
          </button>
        </div>
      </div>

      <div class="deck-identity">
        <div class="monogram" aria-hidden="true" title="Initials. Instagram exports do not include profile photos.">
          {initials(account.display)}
        </div>
        <div class="deck-name">
          <h2 class="deck-handle">@{account.display}</h2>
          <div class="deck-subhandle">Initials, not a photo. Preview the real profile.</div>
        </div>
      </div>

      <div class="deck-badges">
        <span class={`badge ${followBackClass}`}>{followBack.label}</span>
        <span class={`badge ${statusClass}${!decision || decision.choice === 'undecided' ? ' badge--hide-mobile' : ''}`}>{status.label}</span>
        {decision?.protected ? <span class="badge badge--muted"><Icon name="lock" size={11} /> Locked</span> : null}
        {profileOpenedAt ? <span class="badge badge--muted badge--hide-mobile"><Icon name="eye" size={11} /> Profile opened</span> : null}
      </div>

      <CardProfilePreview account={account} upcoming={upcoming} enabled={previewEnabled} />

      <div class="deck-cutline" aria-hidden="true" />

      <dl class="deck-meta">
        <div class="deck-meta__item">
          <dt>Followed on</dt>
          <dd>
            {followedOn(account.followedAt)}
            <small>{followAge(account.followedAt)}</small>
          </dd>
        </div>
        <div class="deck-meta__item">
          <dt>Follow-back</dt>
          <dd>
            {followBack.label}
            <small>{snapshot.followerData === 'present' ? 'from your export' : 'comparison unavailable'}</small>
          </dd>
        </div>
        <div class="deck-meta__item">
          <dt>Decision</dt>
          <dd>
            {status.label}
            <small>{status.detail ?? 'No decision yet'}</small>
          </dd>
        </div>
        <div class="deck-meta__item">
          <dt>Snapshot</dt>
          <dd>
            {snapshot.exportedAt ? formatDateShort(snapshot.exportedAt) : 'date unknown'}
            <small>Not live data</small>
          </dd>
        </div>
      </dl>

      {decision?.notes ? (
        <p class="rail-note" style={{ marginTop: '12px' }}>
          <Icon name="note" size={12} /> Private note saved
        </p>
      ) : null}

      <div class="deck-open-row">
        <a
          class="profile-link"
          href={account.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpenProfile}
          aria-label={`Open @${account.display} full profile`}
        >
          Open full profile <Icon name="external" size={13} />
        </a>
        {profileOpenedAt ? (
          <span class="profile-opened"><Icon name="eye" size={12} /> Opened {formatDateShort(profileOpenedAt)}</span>
        ) : null}
        <span class="deck-note">Cut ≠ unfollowed</span>
      </div>
    </article>
  );
}

export function StaticCard({ account, index, total, second = false }: { account: Account; index: number; total: number; second?: boolean }): ComponentChildren {
  return (
    <div class={`deck-card deck-card--behind${second ? ' deck-card--behind-2' : ''}`} aria-hidden="true">
      <div class="deck-card__top">
        <div class="deck-index">Card <b>{String(index).padStart(3, '0')}</b> / {String(total).padStart(3, '0')}</div>
      </div>
      <div class="deck-identity">
        <div class="monogram">{initials(account.display)}</div>
        <div class="deck-name">
          <div class="deck-handle">@{account.display}</div>
        </div>
      </div>
    </div>
  );
}
