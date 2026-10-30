import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installPaywallFetch } from './utils/paywall';

installPaywallFetch();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
