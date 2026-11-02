interface WordmarkProps {
  href?: string;
}

export function Wordmark({ href = '#/dashboard' }: WordmarkProps) {
  return (
    <a class="wordmark" href={href} aria-label="FOLLOW/CUT — home">
      <span class="wordmark__mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 4.5h8M3 8.5h6M3 12.5h8" stroke="var(--paper)" stroke-width="1.6" stroke-linecap="round" />
          <path d="M12.5 3.5 15 6l-6.1 6.6-2.2.5.5-2.2Z" fill="var(--accent)" />
        </svg>
      </span>
      <span class="wordmark__text">
        FOLLOW<span class="wordmark__slash">/</span>CUT
      </span>
    </a>
  );
}
