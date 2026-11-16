import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { auth } from './lib/api';
import './index.css';

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The stored session is read from IndexedDB before the first render: works fully offline.
void auth.init().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App auth={auth} />
    </StrictMode>,
  );
});
