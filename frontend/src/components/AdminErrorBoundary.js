import React from 'react';

/**
 * Without this, an uncaught error ANYWHERE inside AdminApp (a failed fetch
 * that throws instead of being caught, a malformed response, etc.) unmounts
 * the ENTIRE React tree — including the sibling AppShell sitting right next
 * to it in App.js's AdminAwareRoot (both are mounted simultaneously; see
 * that file's comment on why). That would look exactly like "exiting admin
 * mode doesn't show my user account" — because nothing renders at all
 * anymore, not just the admin portion. This isolates that blast radius to
 * just the admin side, with a way back to the user account that doesn't
 * depend on anything admin-related still working.
 */
export class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AdminErrorBoundary] admin view crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, background: 'var(--c-slate-900)', color: 'white', padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Something went wrong in the admin dashboard.</div>
          <div style={{ fontSize: 13, color: 'var(--c-slate-300)', maxWidth: 420 }}>
            Your own account is unaffected — you can still get back to it below.
          </div>
          <button
            type="button"
            onClick={() => { this.setState({ error: null }); this.props.onExitToUserView?.(); }}
            style={{
              background: 'var(--c-indigo-600)', color: 'white', border: 'none', padding: '10px 20px',
              borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            ← Exit to my account
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
