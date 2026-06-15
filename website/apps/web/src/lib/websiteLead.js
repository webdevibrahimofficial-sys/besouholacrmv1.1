import { buildAnalyticsContext, trackFormSubmit } from '@/lib/analytics';
import { buildLeadMeta } from '@/lib/utm';

const getIntakeEndpoint = () => {
  const apiKey = import.meta.env.VITE_WEBSITE_INTAKE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Website intake API key is not configured.');
  }

  const rawApiBase = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    'http://127.0.0.1:8000'
  ).trim();

  const endpointBase = rawApiBase.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${endpointBase}/api/intake/website/${apiKey}`;
};

const formatValidationErrors = (errors) => {
  if (!errors || typeof errors !== 'object') {
    return 'Please check the form and try again.';
  }

  const messages = Object.values(errors).flat();
  return messages[0] || 'Please check the form and try again.';
};

export const submitWebsiteLead = async ({
  name,
  phone,
  email,
  message,
  service,
  itemId,
  formName,
  source = 'website',
  metaOverrides = {},
}) => {
  const endpoint = getIntakeEndpoint();
  const analyticsContext = buildAnalyticsContext({ form_name: formName });

  const payload = {
    name: name.trim(),
    phone: phone.trim(),
    email: email?.trim() || undefined,
    message: message?.trim() || undefined,
    source,
    meta: {
      ...buildLeadMeta({
        formName,
        service: service?.trim() || undefined,
        itemId: itemId || undefined,
        itemName: service?.trim() || undefined,
        sessionId: analyticsContext.session_id,
        device: analyticsContext.device,
        browser: analyticsContext.browser,
        referrer: analyticsContext.referrer,
      }),
      ...metaOverrides,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.message ||
      formatValidationErrors(data?.errors) ||
      'Failed to submit your request. Please try again.';

    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  void trackFormSubmit(formName);

  return data;
};
