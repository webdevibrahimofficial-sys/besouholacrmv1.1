import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import './index.css'
import './styles/nova.css'
import './styles/company-setup.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import i18n from './i18n'
import { Chart as ChartJS, registerables } from 'chart.js'
import App from './App'
import { ToastProvider } from './shared/context/ToastProvider'
import { TenantProvider } from './shared/context/TenantContext'
import { ThemeProvider } from './shared/context/ThemeProvider'
import { AppStateProvider } from './shared/context/AppStateProvider'
import { CompanySetupProvider } from './pages/settings/company-setup/store/CompanySetupContext'
import ErrorBoundary from './shared/components/common/ErrorBoundary'

// Register all Chart.js components/controllers globally to avoid runtime errors
ChartJS.register(...registerables)

try {
  if (typeof window !== 'undefined' && window.location?.hostname?.endsWith('.')) {
    const u = new URL(window.location.href)
    u.hostname = u.hostname.replace(/\.+$/, '')
    window.location.replace(u.toString())
  }
} catch {}

// Apply Chart.js global defaults from saved system preferences
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const prefsRaw = window.localStorage.getItem('systemPrefs')
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw)
      if (prefs) {
        // Rounded bars
        ChartJS.defaults.elements = ChartJS.defaults.elements || {}
        ChartJS.defaults.elements.bar = {
          ...(ChartJS.defaults.elements.bar || {}),
          borderRadius: prefs.chartsRounded ? 6 : 0,
        }
        // Stacked columns/bars by default
        ChartJS.defaults.scales = {
          ...(ChartJS.defaults.scales || {}),
          x: { ...(ChartJS.defaults.scales?.x || {}), stacked: !!prefs.chartsStacked },
          y: { ...(ChartJS.defaults.scales?.y || {}), stacked: !!prefs.chartsStacked },
        }
      }
    }
  }
} catch {}

const queryClient = new QueryClient()
const APP_BUILD_ID = '2026-06-16-fix-login-bundle'

console.log('CRM App Initialized - Version: ' + new Date().toISOString(), APP_BUILD_ID)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <ToastProvider>
            <TenantProvider>
              <ThemeProvider>
                <AppStateProvider>
                  <CompanySetupProvider>
                    <ErrorBoundary>
                      <App />
                    </ErrorBoundary>
                  </CompanySetupProvider>
                </AppStateProvider>
              </ThemeProvider>
            </TenantProvider>
          </ToastProvider>
        </HashRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
)
const normalizeDateLabels = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const originalText = node.nodeValue ?? "";

    if (originalText.includes("Created Date")) {
      node.nodeValue = originalText.replaceAll("Created Date", "Creation Date");
      continue;
    }

    if (/^Comments(\s*\(|$)/.test(node.nodeValue?.trim() ?? "")) {
      node.nodeValue = node.nodeValue.replace("Comments", "Post Comments");
    }

    if (node.nodeValue?.includes("[Media message, no text]")) {
      node.nodeValue = node.nodeValue.replaceAll("[Media message, no text]", "Media message");
    }
  }
};

normalizeDateLabels(document.documentElement);

new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes("Created Date")) {
        node.nodeValue = node.nodeValue.replaceAll("Created Date", "Creation Date");
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const originalText = node.nodeValue ?? "";

        if (originalText.includes("Created Date")) {
          node.nodeValue = originalText.replaceAll("Created Date", "Creation Date");
          return;
        }
      }

      if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes("[Media message, no text]")) {
        node.nodeValue = node.nodeValue.replaceAll("[Media message, no text]", "Media message");
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        normalizeDateLabels(node);
      }
    });
  });
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
