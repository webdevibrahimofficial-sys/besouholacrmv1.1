import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  resetScrollTracking,
  trackPageView,
  trackScrollDepth,
} from '@/lib/analytics';

const WebsiteAnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    resetScrollTracking();
    trackPageView();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleScroll = () => trackScrollDepth();

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  return null;
};

export default WebsiteAnalyticsTracker;
