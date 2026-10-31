import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAppCore } from './core/appCore';
import { serverFor } from './core/server';
import { openStore } from './core/store';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App core={core} />
  </StrictMode>,
);
