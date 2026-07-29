import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import ScrollToTop from '@/components/ScrollToTop';
import UtmCapture from '@/components/UtmCapture';
import WebsiteAnalyticsTracker from '@/components/WebsiteAnalyticsTracker';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <BrowserRouter>
      <UtmCapture />
      <WebsiteAnalyticsTracker />
      <ScrollToTop />
      <App />
    </BrowserRouter>
  </>
);