import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

async function boot() {
  if (import.meta.env.MODE === 'mock') {
    const { installMock } = await import('./mock');
    installMock();
  }
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
