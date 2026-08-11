export const resolveImageFallback = (event, fallbackSrc) => {
  if (!fallbackSrc) return;

  const image = event.currentTarget;
  if (!image || image.dataset.fallbackApplied === 'true') {
    return;
  }

  image.dataset.fallbackApplied = 'true';
  image.src = fallbackSrc;
};

const getApiBase = () => {
  const raw = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    'http://localhost'
  ).trim();

  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
};

export const normalizeWebsiteAssetUrl = (url) => {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const apiAssetPath = '/api/public-website-assets/';

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.pathname.startsWith(apiAssetPath)) {
      return `${getApiBase()}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
  }

  if (trimmed.startsWith(apiAssetPath)) {
    return `${getApiBase()}${trimmed}`;
  }

  return trimmed;
};
