import { render } from 'preact';
import './styles/app.css';
import { App } from './app';
import { ErrorBoundary } from './components/ErrorBoundary';
import { store } from './lib/store';

function decodeHandoff(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

// The local share server injects one of these only for a one-time phone page.
// Consume it before the first render so the deck is ready on the phone.
const handoff = window.__FOLLOWCUT_HANDOFF__;
if (typeof handoff === 'string' && handoff) {
  try {
    store.restoreBackupText(decodeHandoff(handoff));
    store.setView('review');
    store.setNotice('success', 'Linked live to your computer. Decisions sync as you review.');
  } catch {
    store.setNotice('error', 'That phone handoff could not be read. Ask the computer for a new code.');
  }
  delete window.__FOLLOWCUT_HANDOFF__;
}

const root = document.getElementById('app');
if (root) {
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root
  );
}
