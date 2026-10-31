import { useEffect, useState } from 'react';
import { installHint } from './pwa';

type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };

/** Add to Home Screen: iOS gets the share-sheet steps, Android the install prompt once the browser offers it. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent>();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
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
