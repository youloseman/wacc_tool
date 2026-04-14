import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MetadataProvider } from './context/MetadataContext';
import './index.css';
import './print.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MetadataProvider>
        <App />
      </MetadataProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
