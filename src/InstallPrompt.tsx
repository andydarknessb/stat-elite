import { useEffect, useState } from 'react';
import { installHint } from './pwa';

type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };

// Captured at import, before any screen mounts: the browser fires beforeinstallprompt once, and the card may be off screen then.
let deferred: InstallPromptEvent | undefined;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
});

/** Add to Home Screen: iOS gets the share-sheet steps, Android the install prompt once the browser offers it. */
export function InstallPrompt() {
  const [event, setEvent] = useState(() => deferred);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onPrompt = () => setEvent(deferred);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const hint = installHint({ userAgent: navigator.userAgent, standalone, installEvent: event !== undefined });
  if (dismissed || hint === 'hidden') return null;
  return (
    <section className="install" aria-label="Add to Home Screen">
      {hint === 'ios' && <p>Install StatElite: in Safari, tap Share, then Add to Home Screen.</p>}
      {hint === 'menu' && <p>Install StatElite: open the browser menu and tap Install app.</p>}
      {hint === 'prompt' && event && (
        <>
          <p>Install StatElite to open it from your home screen, even with no signal.</p>
          <button
            className="primary"
            onClick={() => {
              // a prompt event can be shown once, so a later mount must not offer it again
              deferred = undefined;
              setDismissed(true);
              void event.prompt();
            }}
          >
            Install
          </button>
        </>
      )}
      <button onClick={() => setDismissed(true)}>Not now</button>
    </section>
  );
}
