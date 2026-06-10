import { defaultWebsiteContent } from '@/lib/cmsDefaults';

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

export const fetchWebsiteContent = async () => {
  const tenantSlug = getTenantSlug();
  const endpoint = `${getApiBase()}/api/public/website/${tenantSlug}`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`CMS request failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      fromCms: true,
    };
  } catch (error) {
    console.warn('Falling back to static website content:', error.message);
    return {
      fromCms: false,
      settings: defaultWebsiteContent.settings,
      sections: Object.entries(defaultWebsiteContent.sections).map(([type, content]) => ({
        type,
        content,
      })),
      services: defaultWebsiteContent.services,
      items: [],
    };
  }
};
