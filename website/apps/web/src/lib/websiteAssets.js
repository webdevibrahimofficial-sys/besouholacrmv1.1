export const resolveImageFallback = (event, fallbackSrc) => {
  if (!fallbackSrc) return;

  const image = event.currentTarget;
  if (!image || image.dataset.fallbackApplied === 'true') {
    return;
  }

  image.dataset.fallbackApplied = 'true';
  image.src = fallbackSrc;
};
