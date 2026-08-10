import { api } from '@utils/api'
import { useMutation, useQuery } from '@tanstack/react-query'
import { shouldUseAdminPanel } from '@utils/authRouting'

export const login = async (email, password, subdomain, rememberMe = false) => {
  const payload = { email, password };
  if (subdomain) {
    payload.subdomain = subdomain;
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isSubdomain = (() => {
    const parts = host.split('.');
    if (parts[0] === 'www') parts.shift();
    const isLocal = parts.includes('localhost');
    const threshold = isLocal ? 1 : 2;
    return parts.length > threshold;
  })();
  const endpoint = isSubdomain ? '/api/login' : '/api/crm/login-redirect';
  const res = await api.post(endpoint, payload);

  // Check for 2FA
  if (res?.data?.requires_2fa) {
    return { 
      requires_2fa: true, 
      message: res.data.message 
    };
  }

  const responseData = res?.data?.data || res?.data || {};
  const token = responseData?.token;
  const redirectUrl = responseData?.redirect_url;
  const user = responseData?.user;
  if (token) {
    if (typeof window !== 'undefined') {
      if (rememberMe) {
        window.localStorage.setItem('token', token);
        window.sessionStorage.removeItem('token');
      } else {
        window.sessionStorage.setItem('token', token);
        window.localStorage.removeItem('token');
      }
      const host = window.location.hostname;
      const parts = host.split('.');
      if (parts[0] === 'www') parts.shift();
      // Fix for .test domains and general 2-part domains (e.g. alisraa.test)
      // We want the last two parts for the domain (e.g. .alisraa.test, .localhost)
      const domain = parts.includes('localhost') ? '.localhost' : (parts.length > 1 ? '.' + parts.slice(-2).join('.') : '');
      if (domain) {
        const maxAge = rememberMe ? 7 * 24 * 60 * 60 : '';
        document.cookie = `token=${encodeURIComponent(token)};path=/;domain=${domain};${maxAge ? `max-age=${maxAge};` : ''}SameSite=Lax`;
      }
    }
    const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: 'Logged in' } });
    window.dispatchEvent(evt);
  }
  
  const routingOptions = {
    permissions: responseData?.user_permissions,
    subscriptionPlan: responseData?.subscription_plan,
    panelMode: responseData?.panel_mode,
    isSystemAdmin: responseData?.is_system_admin,
  }
  const useAdminPanel = shouldUseAdminPanel(user, responseData?.impersonation, routingOptions)
  const normalizeHost = (host) => String(host || '').replace(/^www\./i, '').toLowerCase();
  const isLocalHostname = (host) => ['localhost', '127.0.0.1'].includes(normalizeHost(host));

  if (useAdminPanel) {
    if (typeof window !== 'undefined' && token) {
      const tok = encodeURIComponent(token);
      const encodedNext = encodeURIComponent('/system/dashboard');
      const parts = window.location.hostname.split('.');
      if (parts[0] === 'www') parts.shift();
      const centralHost = parts.includes('localhost')
        ? 'localhost'
        : (parts.length > 2 ? parts.slice(-2).join('.') : window.location.hostname);
      const targetBase = `${window.location.protocol}//${centralHost}${window.location.port ? `:${window.location.port}` : ''}`;
      if (window.location.origin === targetBase) {
        return {
          token,
          redirected: false,
          redirect_mode: 'same_origin',
          next_path: '/system/dashboard',
          redirect_url: redirectUrl || null,
          user,
          isSuperAdmin: true,
          panel_mode: responseData?.panel_mode || 'system',
          subscription_plan: responseData?.subscription_plan,
          user_permissions: responseData?.user_permissions,
          tenant_subdomain_url: responseData?.tenant_subdomain_url || null,
        };
      } else {
        window.location.href = `${targetBase}/#/auth/callback?token=${tok}&next=${encodedNext}`;
      }
    }

    return {
      token,
      redirected: true,
      redirect_mode: 'hard',
      redirect_url: redirectUrl || null,
      user,
      isSuperAdmin: true,
      panel_mode: responseData?.panel_mode || 'system',
      subscription_plan: responseData?.subscription_plan,
      user_permissions: responseData?.user_permissions,
      tenant_subdomain_url: responseData?.tenant_subdomain_url || null,
    };
  }

  if (!isSubdomain && redirectUrl) {
    if (typeof window !== 'undefined') {
      const tok = token ? encodeURIComponent(token) : '';
      const nextPath = useAdminPanel ? '/system/dashboard' : '/dashboard';
      const encodedNext = encodeURIComponent(nextPath);
      const isLocalHost = isLocalHostname(window.location.hostname);
      let shouldHardRedirect = true;

      try {
        const redirectTarget = new URL(redirectUrl, window.location.origin);
        const redirectOrigin = redirectTarget.origin;
        const currentOrigin = window.location.origin;
        const redirectHost = redirectTarget.hostname;
        const currentHost = window.location.hostname;

        const sameExactOrigin = redirectOrigin === currentOrigin;
        const sameCanonicalHost = normalizeHost(redirectHost) === normalizeHost(currentHost);
        const localhostTenantSwitch =
          isLocalHost
          && normalizeHost(redirectHost).endsWith('.localhost')
          && normalizeHost(redirectHost) !== normalizeHost(currentHost);

        shouldHardRedirect = localhostTenantSwitch || !(sameExactOrigin || sameCanonicalHost);
      } catch {
        shouldHardRedirect = !redirectUrl.startsWith(window.location.origin);
      }

      if (shouldHardRedirect) {
        window.location.href = `${redirectUrl}/#/auth/callback?token=${tok}&next=${encodedNext}`;
        return {
          token,
          redirected: true,
          redirect_mode: 'hard',
          redirect_url: redirectUrl || null,
          user,
          tenant: responseData?.tenant,
          panel_mode: responseData?.panel_mode,
          subscription_plan: responseData?.subscription_plan,
          tenant_subdomain_url: responseData?.tenant_subdomain_url || null,
        };
      }

      if (isLocalHost) {
        return {
          token,
          redirected: false,
          redirect_mode: 'local_hash',
          next_path: nextPath,
          redirect_url: redirectUrl || null,
          user,
          tenant: responseData?.tenant,
          tenant_subdomain_url: responseData?.tenant_subdomain_url || null,
        };
      }

      return {
        token,
        redirected: false,
        redirect_mode: 'same_origin',
        next_path: nextPath,
        redirect_url: redirectUrl || null,
        user,
        tenant: responseData?.tenant,
        panel_mode: responseData?.panel_mode,
        subscription_plan: responseData?.subscription_plan,
        user_permissions: responseData?.user_permissions,
        tenant_subdomain_url: responseData?.tenant_subdomain_url || null,
      };
    }
  }
  return {
    token,
    redirected: false,
    redirect_mode: 'none',
    redirect_url: redirectUrl || null,
    next_path: useAdminPanel ? '/system/dashboard' : '/dashboard',
    user,
    tenant: responseData?.tenant,
    panel_mode: responseData?.panel_mode,
    subscription_plan: responseData?.subscription_plan,
    user_permissions: responseData?.user_permissions,
    enabled_modules: responseData?.enabled_modules,
    tenant_subdomain_url: responseData?.tenant_subdomain_url || null,
  };
}

export const logout = async ({ tokenOverride } = {}) => {
  const token =
    tokenOverride ||
    window.localStorage.getItem('token') ||
    window.sessionStorage.getItem('token')

  try {
    if (token) {
      await api.post(
        '/api/logout',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          skipAuthRedirect: true,
          suppressErrorStatuses: [401],
          suppressErrorLog: true,
        }
      )
    }
  } catch {}
  window.localStorage.removeItem('token')
  window.sessionStorage.removeItem('token')
  try {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const parts = host.split('.');
      if (parts[0] === 'www') parts.shift();
      
      // 1. Clear for current path
      document.cookie = `token=;path=/;max-age=0`;
      
      // 2. Clear for root domain (e.g. .besouholacrm.net)
      const rootDomain = parts.length > 1 ? '.' + parts.slice(-2).join('.') : null;
      if (rootDomain) {
        document.cookie = `token=;path=/;domain=${rootDomain};max-age=0`;
      }
      
      // 3. Clear for current domain (e.g. .tenant.besouholacrm.net)
      const currentDomain = '.' + parts.join('.');
      if (currentDomain !== rootDomain) {
        document.cookie = `token=;path=/;domain=${currentDomain};max-age=0`;
      }
      
      // 4. Clear for localhost if applicable
      if (host === 'localhost') {
         document.cookie = `token=;path=/;domain=.localhost;max-age=0`;
      }
    }
  } catch {}
  const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: 'Logged out' } })
  window.dispatchEvent(evt)
}

export const getProfile = async (config = {}) => {
  const res = await api.get('/api/company-info', config)
  return res?.data?.data || res?.data
}

export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: () => getProfile() })

export const useLogin = () => useMutation({ mutationFn: ({ email, password, rememberMe }) => login(email, password, undefined, rememberMe) })
