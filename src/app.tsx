import { useEffect, useState } from 'preact/hooks';
import type { View } from './lib/types';
import { store } from './lib/store';
import { useMediaQuery, useStore } from './lib/hooks';
import { currentAccount, getCounts, relativeTime } from './lib/selectors';
import { readHash, writeHash } from './lib/router';
import { formatNumber } from './lib/selectors';
import { Wordmark } from './components/Wordmark';
import { Icon } from './components/Icon';
import { HelpDialog } from './components/HelpDialog';
import { PhoneHandoff } from './components/PhoneHandoff';
import { SyncBridge } from './components/SyncBridge';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Welcome } from './views/Welcome';
import { Dashboard } from './views/Dashboard';
import { Review } from './views/Review';
import { Cleanup } from './views/Cleanup';
import { Settings } from './views/Settings';

const TITLES: Record<View, string> = {
  welcome: 'FOLLOW/CUT — curate your Instagram following, locally',
  dashboard: 'Overview — FOLLOW/CUT',
  review: 'Review — FOLLOW/CUT',
  cleanup: 'Cleanup — FOLLOW/CUT',
  settings: 'Data & settings — FOLLOW/CUT'
};

function initialView(): View {
  const fromHash = readHash();
  if (fromHash) return fromHash;
  if (!store.state.dataset) return 'welcome';
  const stored = store.state.ui.view;
  return stored === 'welcome' ? 'dashboard' : stored;
}

export function App() {
  const state = useStore();
  const counts = getCounts(state);
  const [view, setView] = useState<View>(initialView);
  const [helpOpen, setHelpOpen] = useState(false);
  const [demoExitOpen, setDemoExitOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const effectiveTheme = state.settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : state.settings.theme;
  const hasData = Boolean(state.dataset);

  function navigate(next: View) {
    let target = next;
    if (!store.state.dataset && target !== 'welcome') target = 'welcome';
    writeHash(target);
    store.setView(target);
    setView(target);
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  }

  useEffect(() => {
    const previousView = store.state.ui.view;
    const previousActiveAt = store.state.ui.lastActiveAt;
    const initial = initialView();
    if (!readHash()) writeHash(initial, true);
    store.setView(initial);
    setView(initial);
    if (store.state.dataset && previousActiveAt && initial === previousView) {
      const age = Date.now() - new Date(previousActiveAt).getTime();
      if (Number.isFinite(age) && age > 60_000 && (previousView === 'review' || previousView === 'cleanup')) {
        const account = currentAccount(store.state);
        const where = previousView === 'review' && account ? `at @${account.display}` : 'in the cleanup queue';
        window.setTimeout(() => store.setNotice('info', `Resumed ${where}. Last saved ${relativeTime(previousActiveAt)}.`), 350);
      }
    }
    const sync = () => {
      // The skip link is an in-page anchor, not an app route. Handle it before
      // the hash router can interpret "#main" as an unknown view.
      if (window.location.hash === '#main') {
        const current = store.state.ui.view;
        window.history.replaceState(null, '', `#/${current}`);
        const main = document.getElementById('main');
        main?.focus();
        main?.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
      let next = readHash() ?? (store.state.dataset ? 'dashboard' : 'welcome');
      if (!store.state.dataset && next !== 'welcome') next = 'welcome';
      if (!readHash()) writeHash(next, true);
      setView(next);
      store.setView(next);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    if (!state.dataset && view !== 'welcome') {
      writeHash('welcome', true);
      setView('welcome');
      store.setView('welcome');
    }
  }, [state.dataset, view]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = state.settings.theme;
    if (state.settings.motion === 'reduce') root.dataset.motion = 'reduce';
    else root.removeAttribute('data-motion');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveTheme === 'dark' ? '#14120e' : '#f3efe6');
  }, [state.settings.theme, state.settings.motion, effectiveTheme]);

  useEffect(() => {
    document.title = TITLES[view];
  }, [view]);

  useEffect(() => {
    const flush = () => store.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    // The skip link lives outside the Preact root. Its `href="#main"` would be
    // interpreted by the hash router as navigation, so handle it directly.
    const onSkip = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('.skip-link')) return;
      event.preventDefault();
      const main = document.getElementById('main');
      main?.focus();
      main?.scrollIntoView({ block: 'start', behavior: 'auto' });
    };
    document.addEventListener('click', onSkip);
    return () => document.removeEventListener('click', onSkip);
  }, []);

  useEffect(() => {
    if (!state.notice) return;
    const id = state.notice.id;
    const timeout = window.setTimeout(() => store.clearNotice(id), state.notice.tone === 'warn' || state.notice.tone === 'error' ? 7000 : 5200);
    return () => window.clearTimeout(timeout);
  }, [state.notice?.id]);

  const help = () => setHelpOpen(true);

  return (
    <div class={`app${hasData ? ' app--has-data' : ''}`}>
      <header class="header">
        <div class="header__inner">
          <Wordmark href={hasData ? '#/dashboard' : '#/welcome'} />
          {hasData ? (
            <nav class="header__nav" aria-label="Primary">
              <a class="nav-link" href="#/dashboard" aria-current={view === 'dashboard' ? 'page' : undefined}>
                <Icon name="dashboard" size={15} /> Overview
              </a>
              <a class="nav-link" href="#/review" aria-current={view === 'review' ? 'page' : undefined}>
                <Icon name="cards" size={15} /> Review <span class="nav-count">{formatNumber(counts.unreviewed)}</span>
              </a>
              <a class="nav-link" href="#/cleanup" aria-current={view === 'cleanup' ? 'page' : undefined}>
                <Icon name="queue" size={15} /> Cleanup <span class="nav-count">{formatNumber(counts.queue)}</span>
              </a>
              <a class="nav-link" href="#/settings" aria-current={view === 'settings' ? 'page' : undefined}>
                <Icon name="settings" size={15} /> Data
              </a>
            </nav>
          ) : null}
          <span class="header__spacer" />
          <div class="header__tools">
            {state.dataset?.snapshot.demo ? <span class="local-pill demo-pill">Demo</span> : null}
            <span class="local-pill">On this device</span>
            {hasData ? (
              <button
                type="button"
                class="icon-btn phone-tool"
                aria-label="Continue on phone"
                title="Continue on phone"
                onClick={() => setPhoneOpen(true)}
              >
                <Icon name="phone" size={18} />
              </button>
            ) : null}
            <button
              type="button"
              class="icon-btn"
              aria-label={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} theme`}
              onClick={() => store.setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
            >
              <Icon name={effectiveTheme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <button type="button" class="icon-btn" aria-label="Open help and keyboard shortcuts" onClick={help}>
              <Icon name="help" size={18} />
            </button>
          </div>
        </div>
      </header>

      {state.storageWarning ? (
        <div class="storage-banner" role="status">
          <div class="storage-banner__inner">
            <Icon name="alert" size={16} />
            <span>{state.storageWarning}</span>
            <button type="button" class="btn btn--sm btn--ghost" onClick={() => store.dismissStorageWarning()}>Dismiss</button>
          </div>
        </div>
      ) : null}

      {state.dataset?.snapshot.demo ? (
        <div class="demo-wrap">
          <div class="demo-banner">
            <Icon name="spark" size={16} />
            <span class="demo-banner__long"><strong>Demo deck.</strong> These accounts are fictional. Changes stay on this device.</span>
            <span class="demo-banner__short"><strong>Demo</strong><span class="demo-banner__extra"> · fictional accounts</span></span>
            <span class="spacer" />
            <button type="button" class="btn btn--sm btn--ghost" onClick={() => setDemoExitOpen(true)}>Exit demo</button>
          </div>
        </div>
      ) : null}

      <main id="main" tabIndex={-1}>
        {view === 'welcome' ? <Welcome onNavigate={navigate} /> : null}
        {view === 'dashboard' && hasData ? <Dashboard onNavigate={navigate} onOpenPhone={() => setPhoneOpen(true)} /> : null}
        {view === 'review' && hasData ? <Review onNavigate={navigate} onHelp={help} /> : null}
        {view === 'cleanup' && hasData ? <Cleanup onNavigate={navigate} onHelp={help} /> : null}
        {view === 'settings' && hasData ? <Settings onNavigate={navigate} onOpenPhone={() => setPhoneOpen(true)} /> : null}
      </main>

      {hasData ? <nav class="mobile-nav" aria-label="Primary mobile">
        <a href="#/dashboard" aria-current={view === 'dashboard' ? 'page' : undefined}>
          <Icon name="dashboard" size={19} /> Overview
          {counts.unreviewed > 0 && view !== 'review' ? <span class="dot" aria-hidden="true" /> : null}
        </a>
        <a href="#/review" aria-current={view === 'review' ? 'page' : undefined}>
          <Icon name="cards" size={19} /> Review
          {counts.unreviewed > 0 ? <span class="dot" aria-hidden="true" /> : null}
        </a>
        <a href="#/cleanup" aria-current={view === 'cleanup' ? 'page' : undefined}>
          <Icon name="queue" size={19} /> Cleanup
          {counts.queue > 0 ? <span class="dot" aria-hidden="true" /> : null}
        </a>
        <a href="#/settings" aria-current={view === 'settings' ? 'page' : undefined}>
          <Icon name="settings" size={19} /> Data
        </a>
      </nav> : null}

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{state.status}</div>

      {state.notice ? (
        <div class={`toast toast--${state.notice.tone}`} role="status">
          <Icon name={state.notice.tone === 'success' ? 'check' : state.notice.tone === 'info' ? 'info' : 'alert'} size={18} />
          <span class="toast__msg">{state.notice.message}</span>
          <button type="button" class="toast__close" aria-label="Dismiss message" onClick={() => store.clearNotice(state.notice?.id)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      ) : null}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PhoneHandoff open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      <SyncBridge />

      <ConfirmDialog
        id="demo-exit"
        open={demoExitOpen}
        title="Exit the demo?"
        description="This clears the fictional demo session from this browser."
        confirmLabel="Clear demo and exit"
        cancelLabel="Stay in demo"
        onCancel={() => setDemoExitOpen(false)}
        onConfirm={() => {
          setDemoExitOpen(false);
          store.clearSession();
          navigate('welcome');
        }}
      >
        <p class="rail-note">There is no private data in the demo. Clearing it does not affect your real Instagram account or any archive on disk.</p>
      </ConfirmDialog>
    </div>
  );
}
