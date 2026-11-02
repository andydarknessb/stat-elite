import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAppCore } from './core/appCore';
import { serverFor } from './core/server';
import { openStore } from './core/store';
import { syncOnLaunchAndOnline } from './core/syncTriggers';
import { requestPersistence } from './pwa';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './theme.css';

const core = createAppCore({
  clock: () => new Date(),
  store: openStore(),
  server: serverFor({
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    host: location.hostname,
  }),
});
syncOnLaunchAndOnline(core, window);
// every launch, not only first run: the Games stay on the phone until they sync (ADR 0001)
void requestPersistence(navigator.storage);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App core={core} />
  </StrictMode>,
);
