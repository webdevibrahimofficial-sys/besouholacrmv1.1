import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@shared/context/ThemeProvider';
import { api as axios } from '@utils/api';
import { isSecureQuickSwitchEnabled } from '@utils/features';
import { toast } from 'react-hot-toast';
import { impersonationApi } from '@features/Impersonation/impersonationApi';
import { clearImpersonationHints } from '@utils/authToken';
import {
  LayoutDashboard,
  Users,
  Settings,
  Key,
  ListTodo,
  ScrollText,
  Share2,
  Globe,
  AlertOctagon,
  Database,
  ArrowLeftRight,
  X,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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

  const [showQuickSwitch, setShowQuickSwitch] = useState(false);
  const [quickSwitchLoading, setQuickSwitchLoading] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState(null);
  const [quickSwitchSearch, setQuickSwitchSearch] = useState('');
  const [activeTenants, setActiveTenants] = useState([]);
  const [stoppingImpersonation, setStoppingImpersonation] = useState(false);
  const [websiteExpanded, setWebsiteExpanded] = useState(false);
  const [errorLogCount, setErrorLogCount] = useState(0);
  const [currentImpersonation, setCurrentImpersonation] = useState(null);
  const secureQuickSwitchEnabled = isSecureQuickSwitchEnabled();

  const isLight = resolvedTheme === 'light';
  const isRTL = i18n.language === 'ar';

  const currentLogo = collapsed
    ? (resolvedTheme === 'dark' ? darkLogoCollapse : lightLogoCollapse)
    : (resolvedTheme === 'dark' ? darkLogo : lightLogo);

  const asideTone = isLight
    ? 'bg-white border-r border-gray-200'
    : 'bg-[#0f172a] border-r border-slate-800';
  const activeLink = isLight
    ? 'bg-blue-50 text-blue-600 font-medium'
    : 'bg-blue-950/50 text-blue-300 font-medium border border-blue-500/20';
  const baseLink = `flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent transition-all duration-200 text-sm ${
    isLight
      ? 'text-gray-700 hover:bg-gray-100'
      : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
  }`;
  const subLinkBase = `flex items-center rounded-lg px-3 py-2 text-sm border border-transparent transition-all duration-200 ${
    isLight
      ? 'text-gray-600 hover:bg-gray-100'
      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
  }`;
  const subLinkActive = isLight
    ? 'bg-blue-50 text-blue-600 font-medium'
    : 'bg-blue-950/40 text-blue-300 font-medium border border-blue-500/15';

  const websiteSubmenuItems = [
    { title: 'Analytics', path: '/system/website?tab=analytics' },
    { title: 'Homepage', path: '/system/website?tab=homepage' },
    { title: 'Services', path: '/system/website?tab=services' },
    { title: 'Careers', path: '/system/website?tab=careers' },
    { title: 'Settings', path: '/system/website?tab=settings' },
  ];

  const isWebsiteRoute = location.pathname === '/system/website';
  const activeWebsiteTab = new URLSearchParams(location.search).get('tab') || 'settings';

  const menuSections = [
    {
      label: 'Admin Panel',
      items: [
        { title: 'Admin Dashboard', path: '/system/dashboard', icon: <LayoutDashboard size={20} /> },
        { title: 'Super Admin Users', path: '/system/admin-users', icon: <ShieldCheck size={20} /> },
        { title: 'Tasks', path: '/system/tasks', icon: <ListTodo size={20} /> },
        { title: 'Audit Logs', path: '/system/audit-logs', icon: <ScrollText size={20} /> },
      ],
    },
    {
      label: 'Tenant Operations',
      items: [
        { title: 'Tenant Management', path: '/system/tenants', icon: <Users size={20} /> },
        { title: 'Subscription Plans', path: '/system/subscriptions', icon: <Key size={20} /> },
        { title: 'Transactions', path: '/system/transactions', icon: <ArrowLeftRight size={20} /> },
      ],
    },
    {
      label: 'Platform Control',
      items: [
        { title: 'Administration Settings', path: '/system/settings', icon: <Settings size={20} /> },
        { title: 'Global Integrations', path: '/system/integrations', icon: <Share2 size={20} /> },
        { title: 'Company Website', path: '/system/website', icon: <Globe size={20} />, expandable: true },
      ],
    },
    {
      label: 'Monitoring',
      items: [
        { title: 'Error Log', path: '/system/error-log', icon: <AlertOctagon size={20} />, badgeKey: 'errors' },
        { title: 'Backup', path: '/system/backup', icon: <Database size={20} /> },
      ],
    },
  ];

  useEffect(() => {
    if (isWebsiteRoute) {
      setWebsiteExpanded(true);
    }
  }, [isWebsiteRoute]);

  useEffect(() => {
    let active = true;

    const loadErrorCount = async () => {
      try {
        const response = await axios.get('/api/super-admin/system-errors', {
          params: { page: 1, per_page: 1 },
        });
        if (!active) return;
        setErrorLogCount(Number(response.data?.meta?.total || 0));
      } catch (error) {
        if (!active) return;
        console.error('Failed to load error log count:', error);
      }
    };

    loadErrorCount();
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!secureQuickSwitchEnabled) {
      return undefined;
    }

    let active = true;
    impersonationApi.currentSystem()
      .then((response) => {
        if (!active) return;
        setCurrentImpersonation(response.data?.active ? response.data?.session || null : null);
      })
      .catch(() => {
        if (!active) return;
        setCurrentImpersonation(null);
      });

    return () => {
      active = false;
    };
  }, [secureQuickSwitchEnabled, location.pathname]);

  useEffect(() => {
    if (!showQuickSwitch) {
      setQuickSwitchSearch('');
      return;
    }

    let active = true;
    const loadTenants = async () => {
      setQuickSwitchLoading(true);
      try {
        const response = secureQuickSwitchEnabled
          ? await impersonationApi.quickSwitchTenants({ status: 'active', limit: 25, search: quickSwitchSearch.trim() || undefined })
          : await axios.get('/api/super-admin/tenants', {
              params: { status: 'active', page: 1 },
            });
        if (!active) return;
        setActiveTenants(secureQuickSwitchEnabled ? (response.data?.data || []) : (response.data?.tenants?.data || []));
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
  }, [showQuickSwitch, t, secureQuickSwitchEnabled, quickSwitchSearch]);

  const filteredTenants = useMemo(() => {
    const term = quickSwitchSearch.trim().toLowerCase();
    if (!term) return activeTenants;

    return activeTenants.filter((tenant) => {
      const haystack = [tenant.name, tenant.slug, tenant.domain].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [activeTenants, quickSwitchSearch]);

  const isImpersonating = secureQuickSwitchEnabled
    ? !!currentImpersonation
    : false;

  const handleLoginAsTenant = async (tenant) => {
    try {
      setImpersonatingId(tenant.id);
      if (secureQuickSwitchEnabled) {
        const reason = window.prompt(t('Optional support access reason'), '') || ''
        const response = await impersonationApi.start(tenant.id, {
          mode: 'support_access',
          reason,
        })
        const redirectUrl = response?.data?.redirect_url
        if (!redirectUrl) {
          toast.error(t('Failed to start support access'))
          return
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('impersonateTenantSlug', tenant.slug || '')
          window.location.href = redirectUrl
        }
        return
      }

      toast.error(t('Support access is temporarily unavailable'));
    } catch (error) {
      console.error('Failed to login as tenant:', error);
      toast.error(t('Failed to login as tenant'));
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleStopImpersonation = async () => {
    try {
      setStoppingImpersonation(true);
      if (secureQuickSwitchEnabled) {
        await impersonationApi.exitSystem();
        setCurrentImpersonation(null);
      } else {
        toast.error(t('Support access is temporarily unavailable'));
        return;
      }
      if (typeof window !== 'undefined') {
        clearImpersonationHints();
      }
      toast.success(t('Impersonation stopped'));
    } catch (error) {
      console.error('Failed to stop impersonation:', error);
      toast.error(t('Failed to stop impersonation'));
    } finally {
      setStoppingImpersonation(false);
    }
  };

  const sectionLabelClass = `px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] ${
    isLight ? 'text-gray-400' : 'text-slate-500'
  }`;

  const renderMenuBadge = (item) => {
    if (item.badgeKey === 'errors' && errorLogCount > 0) {
      const label = errorLogCount > 99 ? '99+' : String(errorLogCount);
      return (
        <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          isLight ? 'bg-rose-100 text-rose-700' : 'bg-rose-900/50 text-rose-300'
        }`}>
          {label}
        </span>
      );
    }
    return null;
  };

  const renderMenuItem = (item) => {
    const isWebsiteItem = item.path === '/system/website';

    if (isWebsiteItem && !collapsed) {
      return (
        <div key={item.path}>
          <div className="flex items-center gap-1">
            <NavLink
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 768) onClose();
                setWebsiteExpanded(true);
              }}
              className={({ isActive }) => `
                ${baseLink}
                flex-1 min-w-0
                ${isActive ? activeLink : ''}
              `}
            >
              <span className="min-w-[20px]">{item.icon}</span>
              <span className="truncate">{t(item.title)}</span>
            </NavLink>
            <button
              type="button"
              onClick={() => setWebsiteExpanded((open) => !open)}
              className={`shrink-0 rounded-lg p-2 transition ${
                isLight ? 'text-gray-500 hover:bg-gray-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              aria-label={websiteExpanded ? t('Collapse submenu') : t('Expand submenu')}
              aria-expanded={websiteExpanded}
            >
              <ChevronDown size={16} className={`transition-transform ${websiteExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {websiteExpanded ? (
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
      );
    }

    return (
      <NavLink
        key={item.path}
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
        <span className={collapsed ? '' : 'min-w-[20px]'}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span className="truncate">{t(item.title)}</span>
            {renderMenuBadge(item)}
          </>
        )}
      </NavLink>
    );
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
                className={`rounded-lg p-2 transition ${isLight ? 'text-gray-500 hover:bg-gray-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
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
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        isLight
                          ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                          : 'border-slate-700 bg-slate-900/50 hover:border-blue-500/30 hover:bg-blue-950/40'
                      }`}
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
        id="super-admin-sidebar"
        className={`fixed inset-y-0 ${isRTL ? 'right-0 border-l' : 'left-0 border-r'} z-50 flex flex-col transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full')}
          md:translate-x-0
          ${collapsed ? 'w-[88px]' : 'w-[280px]'}
          ${asideTone}
        `}
      >
        <div className={`h-16 flex items-center justify-between px-4 border-b ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
          <div className={`flex items-center gap-2 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
            <img src={currentLogo} alt="Logo" className="h-8 object-contain" />
            {!collapsed && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/40 text-blue-300'
              }`}>
                {t('Super Admin')}
              </span>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden md:flex p-1.5 rounded-lg transition ${isLight ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          >
            <CollapseIcon size={18} />
          </button>

          <button
            onClick={onClose}
            className={`md:hidden p-1.5 rounded-lg transition ${isLight ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {menuSections.map((section, sectionIndex) => (
            <div key={section.label} className={sectionIndex > 0 ? 'mt-4' : ''}>
              {!collapsed && (
                <p className={sectionLabelClass}>{t(section.label)}</p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => renderMenuItem(item))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`p-4 border-t space-y-3 ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
          {isImpersonating && (
            <button
              onClick={handleStopImpersonation}
              disabled={stoppingImpersonation}
              className={`flex w-full items-center rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${collapsed ? 'justify-center' : 'gap-3'} ${
                isLight
                  ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                  : 'border-amber-700/50 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/40'
              }`}
              title={t('Exit impersonation')}
            >
              <ArrowLeftRight size={18} />
              {!collapsed && <span className="truncate">{stoppingImpersonation ? t('Stopping...') : t('Exit impersonation')}</span>}
            </button>
          )}

          <button
            onClick={() => setShowQuickSwitch(true)}
            className={`flex w-full items-center rounded-xl border px-3 py-2.5 text-sm font-medium transition ${collapsed ? 'justify-center' : 'gap-3'} ${
              isLight
                ? 'border-gray-200 text-gray-700 hover:bg-gray-100'
                : 'border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
            }`}
            title={t('Tenant Quick Switch')}
          >
            <LogIn size={18} />
            {!collapsed && <span className="truncate">{t('Tenant Quick Switch')}</span>}
          </button>

          {!collapsed && (
            <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${
              isLight ? 'bg-gray-50' : 'bg-slate-800/60'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/50 text-blue-300'
                }`}>
                  <ShieldCheck size={14} />
                </div>
                <span className={`text-[10px] font-medium truncate ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                  {t('Platform control')}
                </span>
              </div>
              <span className={`shrink-0 text-[10px] font-mono ${isLight ? 'text-gray-400' : 'text-slate-500'}`}>
                v1.0.0
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
