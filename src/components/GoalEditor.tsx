import { useEffect, useState } from 'preact/hooks';
import { store } from '../lib/store';
import { getMetrics, formatNumber, type ReadState } from '../lib/selectors';
import { Icon } from './Icon';

interface GoalEditorProps {
  state: ReadState;
  compact?: boolean;
}

export function GoalEditor({ state, compact = false }: GoalEditorProps) {
  const metrics = getMetrics(state);
  const [value, setValue] = useState(state.settings.goal === null ? '' : String(state.settings.goal));
  const [error, setError] = useState('');
  const followers = metrics?.followers ?? null;

  useEffect(() => {
    setValue(state.settings.goal === null ? '' : String(state.settings.goal));
  }, [state.settings.goal]);

  if (!metrics) return null;
  const goal = state.settings.goal;
  const presets: { label: string; value: number }[] = [];
  if (followers !== null && followers > 0) presets.push({ label: `1:1 = ${formatNumber(followers)}`, value: followers });
  for (const preset of [1500, 1200, 1000]) {
    if (!presets.some(item => item.value === preset)) presets.push({ label: formatNumber(preset), value: preset });
  }

  function submit(event: Event) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      store.setGoal(null);
      setError('');
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000 || Math.round(parsed) !== parsed) {
      setError('Use a whole number between 0 and 1,000,000.');
      return;
    }
    setError('');
    store.setGoal(parsed);
  }

  return (
    <div class={`goal-editor${compact ? ' goal-editor--compact' : ''}`}>
      <form class="goal-row" onSubmit={submit}>
        <div class="field">
          <label for={`goal-input-${compact ? 'settings' : 'dash'}`}>Target following count</label>
          <input
            id={`goal-input-${compact ? 'settings' : 'dash'}`}
            class="input"
            type="number"
            inputMode="numeric"
            min="0"
            max="1000000"
            step="1"
            placeholder="Optional"
            value={value}
            onInput={event => setValue((event.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <button type="submit" class="btn">Set goal</button>
        {goal !== null ? <button type="button" class="btn btn--ghost" onClick={() => { setError(''); store.setGoal(null); setValue(''); }}>Clear</button> : null}
      </form>
      {error ? <p class="field-error" role="alert">{error}</p> : null}
      <div class="goal-presets" aria-label="Suggested goals">
        {presets.map(preset => (
          <button
            type="button"
            class={`chip${goal === preset.value ? '' : ''}`}
            key={preset.value}
            aria-pressed={goal === preset.value}
            onClick={() => { setError(''); store.setGoal(preset.value); setValue(String(preset.value)); }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div class="goal-lines">
        {followers !== null ? (
          <p>
            <Icon name="arrow-down" size={13} />{' '}
            <strong>{formatNumber(metrics.parityRemaining)}</strong> more confirmed removals to reach 1:1
            <span class="muted"> (followers stay {formatNumber(followers)})</span>.
          </p>
        ) : (
          <p class="muted">1:1 needs a follower count. This export did not include one.</p>
        )}
        {goal !== null ? (
          metrics.goalRemaining === 0 ? (
            <p><strong>You are at or below this goal.</strong></p>
          ) : (
            <p>
              <strong>{formatNumber(metrics.goalRemaining)}</strong> more confirmed removals to reach {formatNumber(goal)}.
            </p>
          )
        ) : (
          <p class="muted">A goal is optional. It is a threshold, not a score.</p>
        )}
      </div>
      <p class="rail-note">Only manual confirmations count. Marking 100 accounts for cut does not change this number.</p>
    </div>
  );
}
