import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { reloadForNewVersion } from './utils/newVersion';
import './index.css';

// Vite fires this when a lazy-loaded page file can't be fetched - typically because a new version
// was deployed while this tab was open. Load the new version once instead of showing an error.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </StrictMode>,
);
