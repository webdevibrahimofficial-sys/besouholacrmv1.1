import { getStoredUtmParams } from '@/lib/utm';
import { getBrowserName, getDeviceType, getReferrer, getSessionId } from '@/lib/session';

const getApiBase = () => {
  const raw = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    'http://127.0.0.1:8000'
  ).trim();

  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
};

const getTenantSlug = () =>
  import.meta.env.VITE_TENANT_SLUG?.trim() || 'besouhola';

const firedScrollMilestones = new Set();

export const buildAnalyticsContext = (overrides = {}) => {
  const utm = getStoredUtmParams();

  return {
    tenant_slug: getTenantSlug(),
    session_id: getSessionId(),
    page_url: window.location.href,
    page_path: window.location.pathname,
    referrer: getReferrer(),
    device: getDeviceType(),
    browser: getBrowserName(),
    utm_source: utm.utm_source || null,
    utm_campaign: utm.utm_campaign || null,
    utm_medium: utm.utm_medium || null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
};

export const trackEvent = async (eventName, overrides = {}) => {
  if (typeof window === 'undefined') return null;

  const payload = {
    ...buildAnalyticsContext(),
    event_name: eventName,
    ...overrides,
  };

  try {
    const response = await fetch(`${getApiBase()}/api/public/website/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok) {
      return null;
    }

    return response.json().catch(() => null);
  } catch {
    return null;
  }
};

export const trackPageView = () => trackEvent('page_view');

export const trackCtaClick = (label, extra = {}) =>
  trackEvent('cta_click', { meta: { label, ...extra.meta } });

export const trackFormView = (formName) =>
  trackEvent('form_view', { form_name: formName });

export const trackFormStart = (formName) =>
  trackEvent('form_start', { form_name: formName });

export const trackFormSubmit = (formName) =>
  trackEvent('form_submit', { form_name: formName });

export const trackFormError = (formName, message) =>
  trackEvent('form_error', { form_name: formName, meta: { message } });

export const trackServiceView = (serviceSlug, serviceName) =>
  trackEvent('service_view', {
    service_slug: serviceSlug,
    meta: { service_name: serviceName },
  });

export const trackPhoneClick = () => trackEvent('phone_click');
export const trackWhatsappClick = () => trackEvent('whatsapp_click');

export const resetScrollTracking = () => {
  firedScrollMilestones.clear();
};

export const trackScrollDepth = () => {
  const doc = document.documentElement;
  const scrollTop = window.scrollY || doc.scrollTop;
  const viewport = window.innerHeight || doc.clientHeight;
  const height = Math.max(doc.scrollHeight - viewport, 1);
  const percent = Math.round((scrollTop / height) * 100);

  const milestones = [
    { key: 'scroll_25', threshold: 25 },
    { key: 'scroll_50', threshold: 50 },
    { key: 'scroll_75', threshold: 75 },
    { key: 'scroll_100', threshold: 100 },
  ];

  milestones.forEach(({ key, threshold }) => {
    if (percent >= threshold && !firedScrollMilestones.has(key)) {
      firedScrollMilestones.add(key);
      trackEvent(key, { meta: { percent } });
    }
  });
};
