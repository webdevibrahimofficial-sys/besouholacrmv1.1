import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@shared/context/ThemeProvider';
import { useAppState } from '@shared/context/AppStateProvider';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Moon, LogOut, User, Lock, Menu, X, Search, ChevronDown, Building2, Loader2,
  Bell,
} from 'lucide-react';
import { api } from '@utils/api';
import { useAdminNotifications } from '@hooks/useAdminNotifications';

const FlagUS = () => (
  <svg viewBox="0 0 640 480" className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
    <path fill="#bd3d44" d="M0 0h640v480H0"/>
    <path stroke="#fff" strokeWidth="37" d="M0 55.3h640M0 129h640M0 202.8h640M0 276.5h640M0 350.2h640M0 423.9h640"/>
    <path fill="#192f5d" d="M0 0h296.4v258.5H0"/>
    <g fill="#fff">
      <circle cx="35" cy="30" r="13" />
      <circle cx="135" cy="30" r="13" />
      <circle cx="235" cy="30" r="13" />
      <circle cx="85" cy="80" r="13" />
      <circle cx="185" cy="80" r="13" />
      <circle cx="35" cy="130" r="13" />
      <circle cx="135" cy="130" r="13" />
      <circle cx="235" cy="130" r="13" />
    </g>
  </svg>
);

const FlagEG = () => (
  <svg viewBox="0 0 900 600" className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
    <rect width="900" height="600" fill="#ce1126"/>
    <rect width="900" height="400" y="200" fill="#fff"/>
    <rect width="900" height="200" y="400" fill="#000"/>
    <path fill="#c09300" d="M450 250 c50 0 80 30 80 80 s-30 80 -80 80 s-80 -30 -80 -80 s30 -80 80 -80 z" />
  </svg>
);

export default function SuperAdminTopbar({ onMobileToggle, mobileSidebarOpen }) {
  const { setTheme, resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const { user, logout } = useAppState();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantResults, setTenantResults] = useState([]);
  const [tenantSearchOpen, setTenantSearchOpen] = useState(false);
  const [tenantSearchLoading, setTenantSearchLoading] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState('all');
  const [notificationSeverity, setNotificationSeverity] = useState('all');
  const [notificationQuery, setNotificationQuery] = useState('');

  const profileRef = useRef(null);
  const languageRef = useRef(null);
  const tenantSearchRef = useRef(null);
  const mobileSearchRef = useRef(null);
  const notificationsRef = useRef(null);
  const tenantDebounceRef = useRef(null);
  const {
    enabled: adminNotificationsEnabled,
    notifications: adminNotifications,
    unreadCount,
    loading: notificationsLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    archive,
    archiveAllRead,
  } = useAdminNotifications(user);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
      if (languageRef.current && !languageRef.current.contains(event.target)) {
        setIsLanguageOpen(false);
      }
      if (tenantSearchRef.current?.contains(event.target) || mobileSearchRef.current?.contains(event.target)) {
        return;
      }
      if (notificationsRef.current?.contains(event.target)) {
        return;
      }
      setTenantSearchOpen(false);
      setMobileSearchOpen(false);
      setAdminNotificationsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTenantResults = useCallback(async (query) => {
    const term = query.trim();
    if (term.length < 2) {
      setTenantResults([]);
      setTenantSearchLoading(false);
      return;
    }

    setTenantSearchLoading(true);
    try {
      const response = await api.get('/api/super-admin/tenants', {
        params: { search: term, per_page: 8, page: 1 },
      });
      setTenantResults(response.data?.tenants?.data || []);
    } catch (error) {
      console.error('Tenant search failed:', error);
      setTenantResults([]);
    } finally {
      setTenantSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantSearchOpen && !mobileSearchOpen) return undefined;

    clearTimeout(tenantDebounceRef.current);
    tenantDebounceRef.current = setTimeout(() => {
      fetchTenantResults(tenantQuery);
    }, 280);

    return () => clearTimeout(tenantDebounceRef.current);
  }, [tenantQuery, tenantSearchOpen, mobileSearchOpen, fetchTenantResults]);

  const openTenantList = (searchTerm = tenantQuery.trim()) => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    navigate(`/system/tenants${params.toString() ? `?${params.toString()}` : ''}`);
    setTenantSearchOpen(false);
    setMobileSearchOpen(false);
    setTenantQuery('');
    setTenantResults([]);
  };

  const handleTenantSelect = (tenant) => {
    openTenantList(tenant.name || tenant.domain || tenant.slug || '');
  };

  const headerTone = isLight
    ? 'border border-white/70 bg-white/88 shadow-md shadow-slate-900/10 backdrop-blur-xl'
    : 'border border-slate-700/60 bg-slate-900/95 shadow-md shadow-black/30 backdrop-blur-xl';
  const iconBtnClass = `p-2 rounded-xl transition-colors duration-200 ${isLight ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-slate-800 text-slate-200 border border-transparent hover:border-slate-600/50'}`;
  const userInitials = String(user?.name || 'Super Admin')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const firstName = String(user?.name || t('Super Admin')).trim().split(' ')[0];
  const welcomeTitle = t('Welcome back, {{name}}', { name: firstName });
  const welcomeSubtitle = t('Here is what is happening across your workspace today.');
  const languageCode = i18n.language === 'ar' ? 'AR' : 'EN';
  const searchInputClass = `w-full rounded-xl border py-2 text-sm outline-none transition focus:border-blue-400 ${
    isLight
      ? 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
      : 'border-slate-700/60 bg-slate-900/80 text-slate-100 placeholder:text-slate-500'
  }`;

  const renderTenantResults = () => {
    if (tenantSearchLoading) {
      return (
        <div className={`flex items-center gap-2 px-4 py-3 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          <Loader2 size={15} className="animate-spin" />
          <span>{t('Searching tenants...')}</span>
        </div>
      );
    }

    if (tenantQuery.trim().length < 2) {
      return (
        <div className={`px-4 py-3 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {t('Type at least 2 characters to search tenants.')}
        </div>
      );
    }

    if (!tenantResults.length) {
      return (
        <div className={`px-4 py-3 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {t('No tenants found.')}
        </div>
      );
    }

    return (
      <>
        {tenantResults.map((tenant) => (
          <button
            key={tenant.id}
            type="button"
            onClick={() => handleTenantSelect(tenant)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
              isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-800 text-slate-200'
            }`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/40 text-blue-300'}`}>
              <Building2 size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{tenant.name}</p>
              <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{tenant.domain}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              tenant.status === 'active'
                ? isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-900/40 text-emerald-300'
                : isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'
            }`}>
              {tenant.status || 'unknown'}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => openTenantList()}
          className={`w-full border-t px-4 py-2.5 text-left text-xs font-medium transition ${
            isLight ? 'border-slate-200 text-blue-600 hover:bg-slate-50' : 'border-slate-700 text-blue-300 hover:bg-slate-800'
          }`}
        >
          {t('View all matching tenants')}
        </button>
      </>
    );
  };

  const renderTenantSearchField = (compact = false) => (
    <div className={`relative z-[100] ${compact ? 'w-full' : 'w-full max-w-sm'}`}>
      <Search size={16} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
      <input
        type="search"
        value={tenantQuery}
        onChange={(event) => setTenantQuery(event.target.value)}
        onFocus={() => setTenantSearchOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            openTenantList();
          }
          if (event.key === 'Escape') {
            setTenantSearchOpen(false);
            setMobileSearchOpen(false);
          }
        }}
        placeholder={t('Search tenants...')}
        aria-label={t('Search tenants')}
        className={`${searchInputClass} ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
      />
      {(tenantSearchOpen || mobileSearchOpen) && (
        <div className={`absolute top-[calc(100%+8px)] z-[100] max-h-72 w-full overflow-y-auto rounded-xl border ${dropdownPanelClass}`}>
          {renderTenantResults()}
        </div>
      )}
    </div>
  );

  const severityTone = (severity) => {
    switch (String(severity || '').toLowerCase()) {
      case 'critical':
        return isLight ? 'bg-red-100 text-red-700' : 'bg-red-900/40 text-red-300';
      case 'error':
        return isLight ? 'bg-rose-100 text-rose-700' : 'bg-rose-900/40 text-rose-300';
      case 'warning':
        return isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/40 text-amber-300';
      case 'success':
        return isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-900/40 text-emerald-300';
      default:
        return isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300';
    }
  };

  const formatNotificationTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const filteredAdminNotifications = adminNotifications.filter((item) => {
    if (notificationTab === 'active' && item.archived) return false;
    if (notificationTab === 'unread' && (item.read || item.archived)) return false;
    if (notificationTab === 'archived' && !item.archived) return false;
    if (notificationSeverity !== 'all' && item.severity !== notificationSeverity) return false;

    if (notificationQuery.trim()) {
      const haystack = `${item.title || ''} ${item.body || ''} ${item.category || ''} ${item.source || ''}`.toLowerCase();
      if (!haystack.includes(notificationQuery.trim().toLowerCase())) return false;
    }

    return true;
  });

  const refreshDropdown = useCallback(() => {
    const params = {};
    if (notificationSeverity !== 'all') params.severity = notificationSeverity;
    if (notificationQuery.trim()) params.search = notificationQuery.trim();
    return fetchNotifications(params).catch(() => {});
  }, [fetchNotifications, notificationQuery, notificationSeverity]);

  const dropdownPanelClass = isLight
    ? 'border-slate-200 bg-white shadow-xl'
    : 'border-slate-700/60 bg-slate-900 shadow-2xl shadow-black/50';
  const dropdownItemClass = isLight
    ? 'text-slate-700 hover:bg-slate-50'
    : 'text-slate-100 hover:bg-slate-800';
  const dropdownTitleClass = isLight ? 'text-slate-900' : 'text-white';
  const dropdownMutedClass = isLight ? 'text-slate-500' : 'text-slate-300';
  const dropdownIconClass = isLight ? 'text-slate-500' : 'text-slate-300';

  return (
    <div className={`sticky top-0 z-40 mb-4 px-4 pt-1 md:px-8 md:pt-4 xl:px-8 ${
      isLight ? 'bg-[#f8fafc]/92 backdrop-blur-md' : 'bg-[#020617]/98'
    }`}>
      <header className={`relative mx-auto flex min-h-[60px] w-full gap-3 overflow-visible rounded-[20px] py-3 ps-5 pe-4 md:ps-8 md:pe-6 lg:flex-row lg:items-center lg:gap-4 lg:py-2 ${headerTone}`}>
        <div className="flex min-w-0 items-center gap-3 md:gap-4 lg:flex-1">
          <button
            type="button"
            onClick={onMobileToggle}
            className={`md:hidden rounded-lg p-2 transition ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-800 text-slate-200'}`}
            aria-label={mobileSidebarOpen ? t('Close menu') : t('Open menu')}
          >
            {mobileSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <div className="min-w-0 flex-1 ps-1 md:ps-2">
            <p className={`truncate text-sm font-semibold md:text-[15px] ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              {welcomeTitle}
            </p>
            <p className={`mt-0.5 hidden truncate text-[11px] md:block md:text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {welcomeSubtitle}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
            <div ref={mobileSearchRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen((open) => !open);
                  setTenantSearchOpen(true);
                }}
                className={iconBtnClass}
                aria-label={t('Search tenants')}
                aria-expanded={mobileSearchOpen}
              >
                <Search size={20} />
              </button>
              {mobileSearchOpen && (
                <div className={`absolute top-12 z-[100] w-[min(92vw,320px)] rounded-xl border p-3 ${
                  isRTL ? 'left-0' : 'right-0'
                } ${dropdownPanelClass}`}>
                  {renderTenantSearchField(true)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div ref={tenantSearchRef} className="hidden w-full max-w-md flex-1 lg:block">
          {renderTenantSearchField()}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 md:gap-3 lg:ml-0">
          {adminNotificationsEnabled && (
            <div className="relative z-[100]" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setAdminNotificationsOpen((open) => !open)}
                className={`relative ${iconBtnClass}`}
                aria-label={t('Admin notifications')}
                aria-expanded={adminNotificationsOpen}
              >
                <Bell size={18} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>
              {adminNotificationsOpen && (
                <div className={`absolute top-12 ${isRTL ? 'left-0' : 'right-0'} z-[120] w-[min(96vw,520px)] overflow-hidden rounded-2xl border ${dropdownPanelClass}`}>
                  <div className={`border-b px-4 py-4 ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{t('Admin Notifications')}</p>
                        <p className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {t('Live platform alerts and super admin activity.')}
                        </p>
                      </div>
                      <button type="button" onClick={() => markAllAsRead().catch(() => {})} className="shrink-0 text-xs text-blue-500 hover:text-blue-600">
                        {t('Mark all read')}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { key: 'all', label: t('All') },
                        { key: 'active', label: t('Inbox') },
                        { key: 'unread', label: t('Unread') },
                        { key: 'archived', label: t('Archived') },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setNotificationTab(tab.key)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            notificationTab === tab.key
                              ? 'bg-blue-600 text-white'
                              : isLight
                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <input
                        type="search"
                        value={notificationQuery}
                        onChange={(event) => setNotificationQuery(event.target.value)}
                        placeholder={t('Search notifications...')}
                        className={`rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-blue-400 ${
                          isLight
                            ? 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400'
                            : 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500'
                        }`}
                      />
                      <select
                        value={notificationSeverity}
                        onChange={(event) => setNotificationSeverity(event.target.value)}
                        className={`rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-blue-400 ${
                          isLight
                            ? 'border-slate-200 bg-white text-slate-700'
                            : 'border-slate-700 bg-slate-950 text-slate-100'
                        }`}
                      >
                        <option value="all">{t('All severities')}</option>
                        <option value="critical">{t('Critical')}</option>
                        <option value="error">{t('Error')}</option>
                        <option value="warning">{t('Warning')}</option>
                        <option value="success">{t('Success')}</option>
                        <option value="info">{t('Info')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="max-h-[26rem] overflow-y-auto">
                    {notificationsLoading ? (
                      <div className={`px-4 py-8 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t('Loading notifications...')}
                      </div>
                    ) : !filteredAdminNotifications.length ? (
                      <div className={`px-4 py-8 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t('No notifications match the current filters.')}
                      </div>
                    ) : (
                      filteredAdminNotifications.slice(0, 12).map((item) => (
                        <div
                          key={item.id}
                          className={`border-b px-4 py-3 transition ${isLight ? 'border-slate-100 hover:bg-slate-50/80' : 'border-slate-800 hover:bg-slate-800/70'} ${!item.read ? (isLight ? 'bg-blue-50/50' : 'bg-blue-950/10') : ''}`}
                        >
                          <div className="mb-1 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {!item.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" /> : null}
                                <p className="truncate text-sm font-semibold">{item.title}</p>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className={`rounded-full px-2 py-0.5 font-semibold ${severityTone(item.severity)}`}>
                                  {item.severity}
                                </span>
                                <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>{item.category}</span>
                                <span className={isLight ? 'text-slate-300' : 'text-slate-600'}>•</span>
                                <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>{item.source}</span>
                              </div>
                            </div>
                            <span className={`shrink-0 text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                              {formatNotificationTime(item.createdAt)}
                            </span>
                          </div>

                          <p className={`line-clamp-2 text-xs leading-5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {item.body || '-'}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-medium">
                            {!item.read ? (
                              <button type="button" onClick={() => markAsRead(item.id).catch(() => {})} className="text-blue-500 hover:text-blue-600">
                                {t('Mark read')}
                              </button>
                            ) : null}
                            {!item.archived ? (
                              <button type="button" onClick={() => archive(item.id).catch(() => {})} className="text-amber-500 hover:text-amber-600">
                                {t('Archive')}
                              </button>
                            ) : null}
                            {item.actionUrl ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!item.read) {
                                    await markAsRead(item.id).catch(() => {});
                                  }
                                  setAdminNotificationsOpen(false);
                                  navigate(item.actionUrl);
                                }}
                                className="text-emerald-500 hover:text-emerald-600"
                              >
                                {t('Open')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className={`flex items-center justify-between gap-2 border-t px-4 py-3 ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700 bg-slate-900/70'}`}>
                    <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('{{count}} shown', { count: Math.min(filteredAdminNotifications.length, 12) })}
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" className="text-xs text-amber-500" onClick={() => archiveAllRead().catch(() => {})}>
                        {t('Archive read')}
                      </button>
                      <button type="button" className="text-xs text-slate-500" onClick={refreshDropdown}>
                        {t('Refresh')}
                      </button>
                      <button type="button" className="text-xs text-blue-500" onClick={() => navigate('/system/notifications')}>
                        {t('View all')}
                      </button>
                      <button type="button" className="text-xs text-blue-500" onClick={() => navigate('/system/notifications/settings')}>
                        {t('Settings')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative z-[100]" ref={languageRef}>
            <button
              type="button"
              onClick={() => setIsLanguageOpen(!isLanguageOpen)}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 transition-colors duration-200 ${
                isLight ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-slate-800 text-slate-200 border border-transparent hover:border-slate-600/50'
              }`}
              title={t('Change Language')}
              aria-label={t('Change Language')}
              aria-haspopup="menu"
              aria-expanded={isLanguageOpen}
            >
              {i18n.language === 'ar' ? <FlagEG /> : <FlagUS />}
              <span className="text-xs font-semibold tracking-wide">{languageCode}</span>
              <ChevronDown size={14} className={`transition-transform ${isLanguageOpen ? 'rotate-180' : ''}`} />
            </button>

            {isLanguageOpen && (
              <div className={`absolute top-12 ${isRTL ? 'left-0' : 'right-0'} z-[100] w-44 rounded-lg border py-1 ${dropdownPanelClass}`} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { i18n.changeLanguage('en'); setIsLanguageOpen(false); }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition ${dropdownItemClass} ${isLight ? 'text-left' : ''}`}
                >
                  <FlagUS /> <span>English</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { i18n.changeLanguage('ar'); setIsLanguageOpen(false); }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition ${dropdownItemClass} ${isLight ? 'text-left' : ''}`}
                >
                  <FlagEG /> <span>العربية</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className={iconBtnClass}
            title={t('Toggle Theme')}
            aria-label={t('Toggle Theme')}
          >
            {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="relative z-[100]" ref={profileRef}>
            <button
              type="button"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={`flex max-w-[220px] items-center gap-2 rounded-full py-1 pl-2 pr-1 transition-colors ${
                isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-800'
              }`}
              title={user?.name || 'Super Admin'}
              aria-label={user?.name || 'Super Admin'}
              aria-haspopup="menu"
              aria-expanded={isProfileOpen}
            >
              <span className={`hidden truncate text-sm font-medium md:block ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                {user?.name || 'Super Admin'}
              </span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {userInitials || 'SA'}
              </div>
              <ChevronDown size={14} className={`hidden shrink-0 md:block ${isLight ? 'text-slate-500' : 'text-slate-400'} ${isProfileOpen ? 'rotate-180' : ''} transition-transform`} />
            </button>

            {isProfileOpen && (
              <div className={`absolute top-12 ${isRTL ? 'left-0' : 'right-0'} z-[100] w-56 rounded-lg border py-1 ${dropdownPanelClass}`} role="menu">
                <div className={`border-b px-4 py-3 ${isLight ? 'border-slate-200' : 'border-slate-600/50'}`}>
                  <p className={`truncate text-sm font-semibold ${dropdownTitleClass}`}>{user?.name || 'Super Admin'}</p>
                  <p className={`truncate text-xs ${dropdownMutedClass}`}>{user?.email || 'system@besouhoula.com'}</p>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { navigate('/system/profile'); setIsProfileOpen(false); }}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition ${dropdownItemClass}`}
                  >
                    <User size={16} className={dropdownIconClass} />
                    <span>{t('Profile')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { navigate('/system/security'); setIsProfileOpen(false); }}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition ${dropdownItemClass}`}
                  >
                    <Lock size={16} className={dropdownIconClass} />
                    <span>{t('Change Password')}</span>
                  </button>
                </div>

                <div className={`border-t py-1 ${isLight ? 'border-slate-200' : 'border-slate-600/50'}`}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition ${
                      isLight
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-red-400 hover:bg-red-950/40 hover:text-red-300'
                    }`}
                  >
                    <LogOut size={16} />
                    <span>{t('Logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
