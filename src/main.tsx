import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAppCore } from './core/appCore';
import { openStore } from './core/store';
import './theme.css';

const core = createAppCore({ clock: () => new Date(), store: openStore(), server: {} });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App core={core} />
  </StrictMode>,
);
