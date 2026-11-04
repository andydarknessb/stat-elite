import { liveQuery } from 'dexie';
import { Component, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppCore } from './core/appCore';

/** The live read models a screen may subscribe to. Nothing else is reachable from a screen's `live`. */
export type LiveReads = Pick<
  AppCore,
  | 'home'
  | 'entry'
  | 'fieldMode'
  | 'buttonSize'
  | 'sync'
  | 'account'
  | 'canInvite'
  | 'isOwner'
  | 'gameSetup'
  | 'gameFeed'
  | 'practiceFocus'
  | 'gameSummary'
  | 'backlogEntry'
  | 'canRemoveGame'
  | 'liveGame'
  | 'gameCopyText'
  | 'gameCard'
  | 'photoCount'
>;

/** What a command runs against: App Core without the live reads. */
export type CommandCore = Omit<AppCore, keyof LiveReads>;

/** What the Recorder sees when the phone's store refuses a write; the screen keeps what it had (#42). */
const NOT_SAVED = 'Not saved. Try again.';

type RunOptions<T> = {
  onDone?: (value: T) => void;
  onRefused?: (error: unknown) => void;
  /** The alert a refusal shows; the default is the store refusal's message. */
  message?: string;
  /** A second call while this one is in flight does nothing (a form save); live taps leave it off. */
  block?: boolean;
};
export type Run = <T>(command: (core: CommandCore) => Promise<T>, options?: RunOptions<T>) => void;

const Seam = createContext<AppCore | undefined>(undefined);

/** Screens reach App Core only through here. A read that fails with nothing on screen reaches the boundary below. */
export function SeamProvider({ core, children }: { core: AppCore; children: ReactNode }) {
  return (
    <Seam.Provider value={core}>
      <ReadBoundary>{children}</ReadBoundary>
    </Seam.Provider>
  );
}

function useCore(): AppCore {
  const core = useContext(Seam);
  if (!core) throw new Error('SeamProvider is missing above this screen');
  return core;
}

/** Re-renders whenever the store data behind a live read changes. undefined while loading, null when the read found nothing. A failed read keeps what the screen had. */
export function useLive<T>(read: (live: LiveReads) => Promise<T>, deps: unknown[]): NonNullable<T> | null | undefined {
  const core = useCore();
  const [state, setState] = useState<{ value: NonNullable<T> | null }>();
  const [failure, setFailure] = useState<{ error: unknown }>();
  useEffect(() => {
    const subscription = liveQuery(() => read(core)).subscribe({
      next: (value) => {
        setState({ value: value ?? null });
        setFailure(undefined);
      },
      error: (error: unknown) => setFailure({ error }),
    });
    return () => subscription.unsubscribe();
  }, deps);
  if (failure && !state) throw failure.error;
  return state?.value;
}

/** Runs one command against App Core, and holds the alert a refusal leaves until the next command lands. */
export function useCommand(): { run: Run; alert: string | undefined; busy: boolean } {
  const core = useCore();
  const [alert, setAlert] = useState<string>();
  const [busy, setBusy] = useState(false);
  // a ref, not state: a second tap before the re-render must already be refused
  const inFlight = useRef(false);
  const run: Run = (command, options = {}) => {
    if (options.block) {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
    }
    command(core)
      .then(
        (value) => {
          setAlert(undefined);
          options.onDone?.(value);
        },
        (error: unknown) => {
          setAlert(options.message ?? NOT_SAVED);
          options.onRefused?.(error);
        },
      )
      .finally(() => {
        if (options.block) {
          inFlight.current = false;
          setBusy(false);
        }
      });
  };
  return { run, alert, busy };
}

/** One root boundary: a read that fails before anything is on screen says so, and Reload starts the phone over. */
class ReadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main>
        <p role="alert">Could not read this phone&apos;s data.</p>
        <button className="primary" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
