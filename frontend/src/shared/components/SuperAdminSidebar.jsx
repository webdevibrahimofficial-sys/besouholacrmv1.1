import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@shared/context/ThemeProvider';
import { useAppState } from '@shared/context/AppStateProvider';
import { api as axios } from '@utils/api';
import { toast } from 'react-hot-toast';
import {
  LayoutDashboard,
  Users,
  Settings,
  Key,
  Settings2,
  Share2,
  Globe,
  AlertOctagon,
  Database,
  ArrowLeftRight,
  X,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Search,
} from 'lucide-react';
import lightLogo from '@assets/be-souhola-logo-light.png';
import darkLogo from '@assets/be-souhola-logo-dark.png';
import lightLogoCollapse from '@assets/be-souhola-logo-light-collapse.png';
import darkLogoCollapse from '@assets/be-souhola-logo-dark-collapse.png';

export default function SuperAdminSidebar({ isOpen, onClose, collapsed, setCollapsed }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const { user, fetchCompanyInfo } = useAppState();

  const [showQuickSwitch, setShowQuickSwitch] = useState(false);
  const [quickSwitchLoading, setQuickSwitchLoading] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState(null);
  const [quickSwitchSearch, setQuickSwitchSearch] = useState('');
  const [activeTenants, setActiveTenants] = useState([]);

  const isLight = resolvedTheme === 'light';
  const isRTL = i18n.language === 'ar';

  const currentLogo = collapsed
    ? (resolvedTheme === 'dark' ? darkLogoCollapse : lightLogoCollapse)
    : (resolvedTheme === 'dark' ? darkLogo : lightLogo);

  const asideTone = isLight ? 'bg-white border-r border-gray-200' : 'bg-[#0f172a] border-r border-gray-800';
  const activeLink = isLight
    ? 'bg-blue-50 text-blue-600 font-medium'
    : 'bg-blue-900/20 text-blue-400 font-medium';
  const baseLink = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`;
  const subLinkBase = `flex items-center rounded-lg px-3 py-2 text-sm transition-all duration-200 ${isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800'}`;
  const subLinkActive = isLight
    ? 'bg-blue-50 text-blue-600 font-medium'
    : 'bg-blue-900/20 text-blue-400 font-medium';

  const websiteSubmenuItems = [
    { title: 'Analytics', path: '/system/website?tab=analytics' },
    { title: 'Homepage', path: '/system/website?tab=homepage' },
    { title: 'Services', path: '/system/website?tab=services' },
    { title: 'Careers', path: '/system/website?tab=careers' },
    { title: 'Settings', path: '/system/website?tab=settings' },
  ];

  const isWebsiteRoute = location.pathname === '/system/website';
  const activeWebsiteTab = new URLSearchParams(location.search).get('tab') || 'settings';

  const menuItems = [
    { title: 'Admin Dashboard', path: '/system/dashboard', icon: <LayoutDashboard size={20} /> },
    { title: 'Tenant Management', path: '/system/tenants', icon: <Users size={20} /> },
    { title: 'Subscription Plans', path: '/system/subscriptions', icon: <Key size={20} /> },
    { title: 'Modules Management', path: '/system/modules', icon: <Settings2 size={20} /> },
    { title: 'Administration Settings', path: '/system/settings', icon: <Settings size={20} /> },
    { title: 'Global Integrations', path: '/system/integrations', icon: <Share2 size={20} /> },
    { title: 'Company Website', path: '/system/website', icon: <Globe size={20} /> },
    { title: 'Error Log', path: '/system/error-log', icon: <AlertOctagon size={20} /> },
    { title: 'Backup', path: '/system/backup', icon: <Database size={20} /> },
    { title: 'Transactions', path: '/system/transactions', icon: <ArrowLeftRight size={20} /> },
  ];

  useEffect(() => {
    if (!showQuickSwitch) {
      setQuickSwitchSearch('');
      return;
    }

    let active = true;
    const loadTenants = async () => {
      setQuickSwitchLoading(true);
      try {
        const response = await axios.get('/api/super-admin/tenants', {
          params: { status: 'active', page: 1 },
        });
        if (!active) return;
        setActiveTenants(response.data?.tenants?.data || []);
      } catch (error) {
        if (!active) return;
        console.error('Failed to load active tenants:', error);
        toast.error(t('Failed to load active tenants'));
      } finally {
        if (active) {
          setQuickSwitchLoading(false);
        }
      }
    };

    loadTenants();
    return () => {
      active = false;
    };
  }, [showQuickSwitch, t]);

  const filteredTenants = useMemo(() => {
    const term = quickSwitchSearch.trim().toLowerCase();
    if (!term) return activeTenants;

    return activeTenants.filter((tenant) => {
      const haystack = [tenant.name, tenant.slug, tenant.domain].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [activeTenants, quickSwitchSearch]);

  const handleLoginAsTenant = async (tenant) => {
    try {
      setImpersonatingId(tenant.id);
      const impersonateResponse = await axios.post(`/api/super-admin/impersonate/${tenant.id}`);
      const apiTenant = impersonateResponse?.data?.tenant || {};
      const slug = apiTenant.slug || tenant.slug || (tenant.domain ? tenant.domain.split('.')[0] : null);

      if (!slug) {
        toast.error(t('Tenant is missing slug'));
        return;
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('impersonateTenantSlug', slug);
      }

      await fetchCompanyInfo();
      toast.success(t('You are now viewing this tenant workspace'));
      setShowQuickSwitch(false);

      if (typeof window !== 'undefined') {
        window.location.hash = '#/dashboard';
      }
    } catch (error) {
      console.error('Failed to login as tenant:', error);
      toast.error(t('Failed to login as tenant'));
    } finally {
      setImpersonatingId(null);
    }
  };

  const CollapseIcon = isRTL
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {showQuickSwitch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('Tenant Quick Switch')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('Impersonate an active tenant admin workspace instantly.')}</p>
              </div>
              <button
                onClick={() => setShowQuickSwitch(false)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="relative mb-4">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={quickSwitchSearch}
                  onChange={(event) => setQuickSwitchSearch(event.target.value)}
                  placeholder={t('Search by name or slug...')}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-100"
                />
              </div>

              <div className="max-h-[420px] overflow-y-auto space-y-2">
                {quickSwitchLoading ? (
                  <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('Loading...')}</div>
                ) : filteredTenants.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('No active tenants found')}</div>
                ) : (
                  filteredTenants.map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => handleLoginAsTenant(tenant)}
                      disabled={impersonatingId === tenant.id}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900 dark:text-gray-100">{tenant.name}</p>
                        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          {tenant.slug || tenant.domain || t('No slug available')}
                        </p>
                      </div>
                      <span className="ml-4 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
                        {impersonatingId === tenant.id ? t('Opening...') : t('Open')}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <aside
        className={`fixed inset-y-0 ${isRTL ? 'right-0 border-l' : 'left-0 border-r'} z-50 flex flex-col transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full')}
          md:translate-x-0
          ${collapsed ? 'w-[88px]' : 'w-[280px]'}
          ${asideTone}
        `}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <div className={`flex items-center gap-2 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
            <img src={currentLogo} alt="Logo" className="h-8 object-contain" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500">Control Panel</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          >
            <CollapseIcon size={18} />
          </button>

          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {menuItems.map((item) => (
            <div key={item.path}>
              <NavLink
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 768) onClose();
                }}
                className={({ isActive }) => `
                  ${baseLink}
                  ${isActive ? activeLink : ''}
                  ${collapsed ? 'justify-center px-0' : ''}
                `}
                title={collapsed ? t(item.title) : ''}
              >
                <span className={`${collapsed ? '' : 'min-w-[20px]'}`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="truncate">{t(item.title)}</span>
                )}
              </NavLink>

              {!collapsed && item.path === '/system/website' && isWebsiteRoute ? (
                <div className="mt-1 space-y-1 pl-11">
                  {websiteSubmenuItems.map((subItem) => {
                    const isSubItemActive = activeWebsiteTab === new URLSearchParams(subItem.path.split('?')[1]).get('tab');

                    return (
                      <NavLink
                        key={subItem.path}
                        to={subItem.path}
                        onClick={() => {
                          if (window.innerWidth < 768) onClose();
                        }}
                        className={`${subLinkBase} ${isSubItemActive ? subLinkActive : ''}`}
                      >
                        <span className="truncate">{t(subItem.title)}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
          <button
            onClick={() => setShowQuickSwitch(true)}
            className={`flex w-full items-center rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 ${collapsed ? 'justify-center' : 'gap-3'} ${isLight ? 'text-gray-700' : 'text-gray-200'}`}
            title={t('Tenant Quick Switch')}
          >
            <LogIn size={18} />
            {!collapsed && <span className="truncate">{t('Tenant Quick Switch')}</span>}
          </button>

          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <ShieldCheck size={16} />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-medium truncate">{user?.name || 'System Administrator'}</span>
                <span className="text-[10px] text-gray-500 truncate">v1.0.0</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
