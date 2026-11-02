import type { View } from '../lib/types';
import { useStore } from '../lib/hooks';
import { store } from '../lib/store';
import {
  currentAccount,
  daysSince,
  formatDate,
  formatNumber,
  formatPercent,
  formatRatio,
  formatSnapshotDate,
  getMetrics,
  relativeAge,
  relativeTime
} from '../lib/selectors';
import { GoalEditor } from '../components/GoalEditor';
import { ProgressBar } from '../components/ProgressBar';
import { Icon } from '../components/Icon';

interface DashboardProps {
  onNavigate: (view: View) => void;
  onOpenPhone: () => void;
}

export function Dashboard({ onNavigate, onOpenPhone }: DashboardProps) {
  const state = useStore();
  const metrics = getMetrics(state);
  if (!state.dataset || !metrics) return null;
  const snapshot = state.dataset.snapshot;
  const resume = currentAccount(state);
  const maybeCount = [...state.decisions.values()].filter(decision => decision.choice === 'maybe').length;
  const age = daysSince(snapshot.exportedAt);
  const followerKnown = snapshot.followerData === 'present';
  const followers = metrics.followers;
  const hasFreshnessWarning = !snapshot.demo && age !== null && age >= 14;
  const lastActive = relativeTime(state.ui.lastActiveAt);

  return (
    <div class="page">
      <div class="page-head">
        <div class="page-head__copy">
          <h1>Following, under control.</h1>
          <p>
            A review deck and a confirmation list. Nothing here is live Instagram data, and nothing here unfollows anyone
            for you.
          </p>
        </div>
        <div class="page-head__actions">
          <button type="button" class="btn btn--primary" onClick={() => onNavigate('review')}>
            <Icon name="play" size={15} filled /> {metrics.reviewed === 0 ? 'Start reviewing' : 'Resume review'}
          </button>
          <button type="button" class="btn" onClick={() => onNavigate('cleanup')}>
            <Icon name="queue" size={15} /> Open cleanup
          </button>
          <button type="button" class="btn btn--ghost" onClick={() => onNavigate('settings')}>
            <Icon name="refresh" size={15} /> Reimport export
          </button>
          <button type="button" class="btn phone-action" onClick={onOpenPhone}>
            <Icon name="phone" size={15} /> Continue on phone
          </button>
        </div>
      </div>

      <div class="dash-grid">
        <section class="panel" aria-labelledby="review-panel-title">
          <div class="panel__head">
            <div>
              <h2 id="review-panel-title">Review progress</h2>
              <p>{resume ? `Pick up at @${resume.display}.` : 'Every card in this snapshot has been reviewed.'}{lastActive ? ` Last active ${lastActive}.` : ''}</p>
            </div>
            <span class="badge badge--muted">Saves after every card</span>
          </div>
          <div class="panel__body">
            <div class="progress-card">
              <div class="progress-card__big">
                <span class="progress-card__num">{formatNumber(metrics.reviewed)}</span>
                <span class="progress-card__den">of {formatNumber(metrics.following)} following</span>
              </div>
              <ProgressBar value={metrics.reviewProgress} label="Review progress" />
              <div class="progress-meta">
                <span>{formatPercent(metrics.reviewProgress)} reviewed</span>
                <span>{formatNumber(metrics.unreviewed)} unreviewed</span>
              </div>
              <p class="progress-card__sub">
                {metrics.unreviewed > 0
                  ? `${formatNumber(metrics.unreviewed)} cards left. You can stop after any card; the deck resumes at the same place.`
                  : 'The deck is done. Maybes and the cleanup queue are still available if you want a second pass.'}
              </p>
              <div class="progress-card__actions">
                <button type="button" class="btn btn--primary" onClick={() => onNavigate('review')}>
                  {metrics.unreviewed > 0 ? 'Resume review' : 'Review the deck'} <Icon name="arrow-right" size={15} />
                </button>
                {maybeCount > 0 ? (
                  <button type="button" class="btn" onClick={() => { store.setFilter('maybe'); onNavigate('review'); }}>
                    {formatNumber(maybeCount)} in Maybe
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section class="panel" aria-labelledby="cleanup-panel-title">
          <div class="panel__head">
            <div>
              <h2 id="cleanup-panel-title">Cleanup progress</h2>
              <p>Manual confirmations only.</p>
            </div>
            <span class="badge badge--outline">Your records</span>
          </div>
          <div class="panel__body progress-card progress-card--cleanup">
            <div class="progress-card__big">
              <span class="progress-card__num">{formatNumber(metrics.confirmedCurrent)}</span>
              <span class="progress-card__den">{metrics.planned === 0 ? 'no cuts planned yet' : `of ${formatNumber(metrics.planned)} intended`}</span>
            </div>
            <ProgressBar value={metrics.cleanupProgress} tone="confirm" label="Cleanup progress" />
            <div class="progress-meta">
              <span>{formatPercent(metrics.cleanupProgress)} confirmed</span>
              <span>{formatNumber(metrics.pendingQueue)} pending</span>
            </div>
            <p class="progress-card__sub">
              Marking a card for cut does not count. Only “I unfollowed this account” does, after you do it yourself.
            </p>
            <p class="rail-note">
              Planned for unfollow: <strong>{formatNumber(metrics.planned)}</strong> · Confirmed manually:{' '}
              <strong>{formatNumber(metrics.confirmedCurrent)}</strong> · Pending: <strong>{formatNumber(metrics.pendingQueue)}</strong>
            </p>
            <div class="progress-card__actions">
              <button type="button" class="btn btn--ink" onClick={() => onNavigate('cleanup')}>
                Open queue <Icon name="arrow-right" size={15} />
              </button>
              {metrics.uncertain > 0 ? (
                <span class="rail-note">{formatNumber(metrics.uncertain)} uncertain · {formatNumber(metrics.skipped)} deferred</span>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <div class="snapshot-head" style={{ marginTop: '32px' }}>
        <span class="not-live">Not live data</span>
        <span>
          Snapshot from <strong>{formatSnapshotDate(snapshot)}</strong>
          {age !== null ? ` · ${relativeAge(snapshot.exportedAt)}` : ''}
        </span>
        {snapshot.exportDateSource === 'unknown' ? <span class="muted">· export date not found in archive name</span> : null}
        <span class="muted">·</span>
        <button type="button" class="btn btn--sm btn--ghost" onClick={() => onNavigate('settings')}>
          <Icon name="refresh" size={13} /> Reimport a newer export
        </button>
      </div>

      <div class="snapshot-strip" role="group" aria-label="Snapshot metrics">
        <div class="stat">
          <b>{followers === null ? '—' : formatNumber(followers)}</b>
          <span>Followers</span>
          <small>{snapshot.followerData === 'missing' ? 'not in export' : snapshot.followerData === 'incomplete' ? 'partial list' : 'from snapshot'}</small>
        </div>
        <div class="stat">
          <b>{formatNumber(metrics.following)}</b>
          <span>Following</span>
          <small>snapshot</small>
        </div>
        <div class={`stat ${metrics.ratio === null ? 'stat--unknown' : ''}`}>
          <b>{metrics.ratio === null ? '—' : `${formatRatio(metrics.ratio)} : 1`}</b>
          <span>Follower ratio</span>
          <small>followers ÷ following</small>
        </div>
        <div class="stat">
          <b>{metrics.mutuals === null ? '—' : formatNumber(metrics.mutuals)}</b>
          <span>Mutuals</span>
          <small>{followerKnown ? 'follow each other' : 'comparison unavailable'}</small>
        </div>
        <div class="stat stat--accent">
          <b>{metrics.notFollowingBack === null ? '—' : formatNumber(metrics.notFollowingBack)}</b>
          <span>Not following back</span>
          <small>{followerKnown ? 'not mutual' : 'comparison unavailable'}</small>
        </div>
        <div class="stat">
          <b>{metrics.fans === null ? '—' : formatNumber(metrics.fans)}</b>
          <span>Fans</span>
          <small>follow you, not back</small>
        </div>
      </div>

      {!followerKnown ? (
        <div class="callout callout--warn" style={{ marginBottom: '24px' }}>
          <Icon name="alert" size={18} />
          <div>
            <strong>{snapshot.followerData === 'missing' ? 'Follower comparison is off.' : 'Follower comparison may be incomplete.'}</strong>{' '}
            {snapshot.followerData === 'missing'
              ? 'This export did not include a follower list, so nobody is labelled “not following back.” Review still works.'
              : 'A follower file could not be read or was empty, so mutual and non-mutual labels are turned off rather than guessed.'}
          </div>
        </div>
      ) : null}
      {hasFreshnessWarning ? (
        <div class="callout callout--warn" style={{ marginBottom: '24px' }}>
          <Icon name="alert" size={18} />
          <div>
            <strong>This export is {relativeAge(snapshot.exportedAt)}.</strong> Follower and following counts may have changed
            on Instagram. Reimport a newer export when you want a fresh snapshot; your decisions merge by exact username.
          </div>
        </div>
      ) : null}

      <div class="dash-grid" style={{ marginTop: '8px' }}>
        <section class="panel" aria-labelledby="goal-panel-title">
          <div class="panel__head">
            <div>
              <h2 id="goal-panel-title">Target</h2>
              <p>Optional. A threshold, not a score.</p>
            </div>
            <span class="badge badge--outline">{state.settings.goal === null ? 'No target set' : `Target ${formatNumber(state.settings.goal)}`}</span>
          </div>
          <div class="panel__body">
            <GoalEditor state={state} />
            <div class="projection">
              <b>
                {formatNumber(metrics.projectedFollowing)} following · {metrics.projectedRatio === null ? '—' : `${formatRatio(metrics.projectedRatio)} : 1`}
              </b>
              <p>
                <strong>Projected, not live.</strong>{' '}
                {metrics.pendingQueue > 0
                  ? `If you confirm all ${formatNumber(metrics.pendingQueue)} pending cuts, this is the estimated result, assuming followers stay at ${followers === null ? 'their snapshot count' : formatNumber(followers)}.`
                  : 'No pending cuts. The projection matches confirmed removals only.'}
              </p>
            </div>
          </div>
        </section>

        <section class="panel" aria-labelledby="snapshot-panel-title">
          <div class="panel__head">
            <div>
              <h2 id="snapshot-panel-title">Snapshot details</h2>
              <p>{snapshot.demo ? 'Demo data — fictional accounts.' : 'What the export actually contained.'}</p>
            </div>
            <button type="button" class="btn btn--sm btn--ghost" onClick={() => onNavigate('settings')}>Data &amp; settings</button>
          </div>
          <div class="panel__body">
            <div class="source-list">
              <div><span>Data set</span><span>{snapshot.sourceLabel ?? 'Selected files'}</span></div>
              <div><span>Export date</span><span>{snapshot.exportedAt ? formatDate(snapshot.exportedAt) : 'Unknown — using import date'}</span></div>
              <div><span>Imported</span><span>{formatDate(snapshot.importedAt)}</span></div>
              <div><span>Date range</span><span>Not recorded in archive</span></div>
              <div><span>Follower list</span><span>{snapshot.followerData === 'present' ? 'Included (assumed complete)' : snapshot.followerData === 'incomplete' ? 'Incomplete' : 'Missing'}</span></div>
              {snapshot.pendingCount !== undefined ? <div><span>Sent follow requests</span><span>{formatNumber(snapshot.pendingCount)} (not part of following)</span></div> : null}
              {snapshot.duplicateCount ? <div><span>Duplicate entries merged</span><span>{formatNumber(snapshot.duplicateCount)}</span></div> : null}
              {snapshot.invalidCount ? <div><span>Entries skipped</span><span>{formatNumber(snapshot.invalidCount)}</span></div> : null}
              {metrics.confirmedArchived > 0 ? <div><span>Archived confirmations</span><span>{formatNumber(metrics.confirmedArchived)}</span></div> : null}
            </div>
            {snapshot.warnings.length > 0 ? (
              <ul class="caveat-list" style={{ marginTop: '16px' }}>
                {snapshot.warnings.map(warning => (
                  <li key={warning}><Icon name="info" size={14} /> {warning}</li>
                ))}
              </ul>
            ) : null}
            <p class="rail-note" style={{ marginTop: '16px' }}>
              Counts in the strip are from this snapshot. “Confirmed” and “estimated” figures are local calculations from
              your manual confirmations; they are never read back from Instagram.
            </p>
          </div>
        </section>
      </div>

      <p class="rail-note" style={{ marginTop: '32px', maxWidth: '78ch' }}>
        Your export is read locally. FOLLOW/CUT has no account, no cloud server, and no Instagram login. {formatNumber(state.decisions.size)} decision{state.decisions.size === 1 ? ' is' : 's are'} saved in this browser.
      </p>
    </div>
  );
}
