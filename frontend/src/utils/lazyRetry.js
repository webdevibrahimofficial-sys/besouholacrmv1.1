import { lazy } from 'react';

/**
 * A wrapper around React.lazy that attempts to refresh the page once if the chunk fails to load.
 * This handles the "Failed to fetch dynamically imported module" error that occurs after deployments.
 */
export const lazyRetry = (componentImport) => {
  return lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const tryImportWithRetries = async (attempts, delayMs) => {
      let lastError;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await componentImport();
        } catch (error) {
          lastError = error;

          const isFinalAttempt = attempt === attempts;
          if (!isFinalAttempt) {
            await sleep(delayMs);
          }
        }
      }

      throw lastError;
    };

    try {
      const component = await tryImportWithRetries(3, 350);
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        // Assuming that the user is not on the latest version of the application.
        // Let's refresh the page immediately.
        console.warn('Chunk load failed, forcing refresh to get latest version...', error);
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        window.location.reload();
        // Return a never-resolving promise to prevent error boundary from flashing before reload
        return new Promise(() => {}); 
      }
      
      // The page has already been reloaded
      // Assuming that user is already using the latest version of the application.
      // Retry a bit more to survive transient Vite/HMR timing issues before crashing.
      return tryImportWithRetries(2, 800);
    }
  });
};
