import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/** Prevents a tab crash from wiping the whole shell to a blank white page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ElfCom ${this.props.label ?? "ui"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-foam">
          <p className="text-sm font-medium">Something went wrong in this view.</p>
          <p className="max-w-sm text-xs text-mist">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ink"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
