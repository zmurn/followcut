interface ProgressBarProps {
  value: number;
  tone?: 'ink' | 'accent' | 'confirm';
  label?: string;
}

export function ProgressBar({ value, tone = 'ink', label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      class={`progress-track${tone === 'accent' ? ' progress-track--accent' : tone === 'confirm' ? ' progress-track--confirm' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
