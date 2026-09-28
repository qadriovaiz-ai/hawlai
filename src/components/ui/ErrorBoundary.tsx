"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

// Keeps one broken section from taking the whole page with it.
//
// On 2026-09-28 a module that should never have been in the browser threw
// while the SEO page was rendering, and the page went black — no heading,
// no health check, no toolkit, nothing to click. The cause is fixed and
// guarded, but the shape of that failure is worth designing for: a page
// here is five or six independent sections, and one of them failing is not
// a reason to lose the other five.
//
// A class component because React offers no hook equivalent —
// componentDidCatch has no functional form.

interface Props {
  /** Named in the message, so the owner knows what is missing. */
  section: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Vercel's logs are where this gets noticed; the owner gets the card.
    console.error(`[error-boundary] ${this.props.section} failed to render:`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" /> {this.props.section} didn't load
        </p>
        <p className="text-xs text-slate-500">
          The rest of this page is fine — only this section stopped. Try it again, and if it keeps
          happening, tell us and we'll look at it.
        </p>
        <button
          onClick={() => this.setState({ failed: false })}
          className="text-xs text-brand-400 hover:underline flex items-center gap-1.5"
        >
          <RotateCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }
}
