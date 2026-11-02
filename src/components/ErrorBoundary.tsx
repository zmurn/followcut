import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<{ children: ComponentChildren }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : 'Unknown error' };
  }

  componentDidCatch(error: unknown): void {
    // No analytics and no upload: the console is the only place this goes.
    console.error('FOLLOW/CUT stopped rendering:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div class="page page--narrow" style={{ paddingTop: '80px' }}>
          <h1 style={{ marginTop: '12px' }}>The interface hit an error.</h1>
          <p style={{ marginTop: '12px', color: 'var(--ink-2)', maxWidth: '60ch' }}>
            Your session should still be in this browser. Reload the page to try again. If reloading fails, download your
            browser data or restore a FOLLOW/CUT backup before clearing anything.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button type="button" class="btn btn--primary" onClick={() => window.location.reload()}>Reload FOLLOW/CUT</button>
            <a class="btn" href="#/welcome" onClick={() => this.setState({ hasError: false, message: '' })}>Go to the welcome screen</a>
          </div>
          <p class="rail-note" style={{ marginTop: '16px' }}>No account data was uploaded. The standalone app has no server.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
