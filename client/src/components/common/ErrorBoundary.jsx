import { Component } from 'react';

/**
 * Catches rendering errors so one broken widget shows a message instead of a blank page.
 * (Error boundaries must still be class components in React.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console -- the only place UI crashes are reported
    console.error('UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto my-16 max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-800">
          Something went wrong on this screen
        </h2>
        <p className="mt-2 text-sm text-slate-600">{this.state.error.message}</p>
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
