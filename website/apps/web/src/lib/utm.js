const UTM_STORAGE_KEY = 'besouhola_utm_params';

const UTM_KEYS = ['utm_source', 'utm_campaign', 'utm_medium'];

export const captureUtmFromUrl = (search = window.location.search) => {
  const params = new URLSearchParams(search);
  const captured = {};

  UTM_KEYS.forEach((key) => {
    const value = params.get(key)?.trim();
    if (value) {
      captured[key] = value;
    }
  });

  if (Object.keys(captured).length === 0) {
    return getStoredUtmParams();
  }

  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(captured));
  } catch {
    // Ignore storage errors in restricted environments.
  }

  return captured;
};

export const getStoredUtmParams = () => {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const buildLeadMeta = ({
  formName,
  service,
  itemId,
  itemName,
  utm = {},
  sessionId,
  device,
  browser,
  referrer,
}) => {
  const storedUtm = getStoredUtmParams();

  return {
    form_name: formName,
    page_url: window.location.href,
    utm_source: utm.utm_source || storedUtm.utm_source || null,
    utm_campaign: utm.utm_campaign || storedUtm.utm_campaign || null,
    utm_medium: utm.utm_medium || storedUtm.utm_medium || null,
    session_id: sessionId || null,
    device: device || null,
    browser: browser || null,
    referrer: referrer || null,
    service_interest: service || null,
    lead_item_id: itemId || null,
    lead_item_name: itemName || service || null,
  };
};
