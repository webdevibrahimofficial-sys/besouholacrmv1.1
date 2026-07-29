const SESSION_STORAGE_KEY = 'besouhola_session_id';

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `sess_${crypto.randomUUID()}`;
  }

  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const getSessionId = () => {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;

    const created = createSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return createSessionId();
  }
};

export const getDeviceType = () => {
  if (typeof window === 'undefined') return 'unknown';

  const width = window.innerWidth || 0;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

export const getBrowserName = () => {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Other';
};

export const getReferrer = () => {
  if (typeof document === 'undefined') return null;
  return document.referrer || null;
};
