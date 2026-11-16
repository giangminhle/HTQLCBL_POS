import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { auth } from './lib/api';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Load the stored session before the first render so protected routes don't flash the login page.
void auth.init().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App auth={auth} />
    </StrictMode>,
  );
});
