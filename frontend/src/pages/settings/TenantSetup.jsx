import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { api as axios } from '@utils/api';
import { useSubscriptionPlans, getPlanModulesForCompany } from '../../hooks/useSubscriptionPlans';
import { useAppState } from '../../shared/context/AppStateProvider';
import { useTheme } from '../../shared/context/ThemeProvider';
import { AVAILABLE_MODULES } from '../../hooks/useTenants';
import {
  Plus, 
  Filter, 
  Search, 
  Users, 
  Key, 
  Eye, 
  EyeOff,
  Activity, 
  Edit, 
  XCircle,
  Building,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X 
} from 'lucide-react';

// AVAILABLE_MODULES imported from useTenants hook

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe"
];

const getInventoryModulesByCompanyType = (companyType = 'General') => {
  if (companyType === 'Real Estate') {
    return ['projects', 'properties', 'developers', 'brokers', 'requests'];
  }

  return ['items', 'orders'];
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const stringValue = String(value);
  const match = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateOnly = (value, locale) => {
  const dateValue = toDateInputValue(value);
  if (!dateValue) return '-';

  const [year, month, day] = dateValue.split('-').map(Number);
  return new Intl.DateTimeFormat(locale).format(new Date(year, month - 1, day));
};

const TenantSetup = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, fetchCompanyInfo } = useAppState();
  const { plans: subscriptionPlans, planMap } = useSubscriptionPlans({ includeInactive: true });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [tenantView, setTenantView] = useState('current');

  // Debounce search to avoid API call on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef(null);
  const handleSearchChange = useCallback((value) => {
    setFilters(prev => ({ ...prev, search: value }));
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 400);
  }, []);
  
  // List View State
  const [tenants, setTenants] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [tenantCounts, setTenantCounts] = useState({ current: 0, archived: 0 });
  const [filters, setFilters] = useState({
    search: '',
    plan: 'all',
    status: 'all',
    company_type: 'all',
    country: 'all',
    users_count: '',
    start_date: '',
    end_date: ''
  });
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    per_page: 20
  });
  const pageSizeOptions = [10, 20, 50, 100];
  const selectablePlans = [...subscriptionPlans, { id: 'custom-plan', code: 'custom', name: 'Custom Plan', modules: [] }];

  // Edit State
  const [editingTenant, setEditingTenant] = useState(null);
  const [previewTenant, setPreviewTenant] = useState(null);
  const [statusTenant, setStatusTenant] = useState(null);
  const [backupTenant, setBackupTenant] = useState(null);
  const [backupItems, setBackupItems] = useState([]);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [startingBackup, setStartingBackup] = useState(false);
  const [backupsPage, setBackupsPage] = useState(1);
  const isCreateRoute = location.pathname === '/system/tenants/new';

  useEffect(() => {
    if (isCreateRoute) return;

    const params = new URLSearchParams(location.search);
    const nextView = params.get('view') || 'current';
    const nextFilters = {
      search: params.get('search') || '',
      plan: params.get('plan') || 'all',
      status: params.get('status') || 'all',
      company_type: params.get('company_type') || 'all',
      country: params.get('country') || 'all',
      users_count: params.get('users_count') || '',
      start_date: params.get('start_date') || '',
      end_date: params.get('end_date') || '',
    };

    setTenantView((prev) => (prev === nextView ? prev : nextView));
    setFilters((prev) => {
      const unchanged = Object.keys(nextFilters).every((key) => prev[key] === nextFilters[key]);
      return unchanged ? prev : nextFilters;
    });
    setDebouncedSearch(nextFilters.search);
  }, [location.search, isCreateRoute]);

  const resetFilters = () => {
    clearTimeout(debounceTimer.current);
    setDebouncedSearch('');
    setFilters({
      search: '',
      plan: 'all',
      status: 'all',
      company_type: 'all',
      country: 'all',
      users_count: '',
      start_date: '',
      end_date: ''
    });
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);

    if (isCreateRoute) {
      navigate('/system/tenants', { replace: true });
    }
  };

  const getVisiblePageNumbers = (currentPage, lastPage) => {
    if (lastPage <= 7) {
      return Array.from({ length: lastPage }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, '...', lastPage];
    }

    if (currentPage >= lastPage - 2) {
      return [1, '...', lastPage - 3, lastPage - 2, lastPage - 1, lastPage];
    }

    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', lastPage];
  };

  // Fetch Tenants
  const fetchTenants = async (page = 1) => {
    setLoadingList(true);
    try {
      const params = {
        page,
        view: tenantView,
        per_page: pagination.per_page,
        ...filters,
        search: debouncedSearch,
      };
      // Clean up 'all' and empty filters
      if (params.plan === 'all') delete params.plan;
      if (params.status === 'all') delete params.status;
      if (params.company_type === 'all') delete params.company_type;
      if (params.country === 'all') delete params.country;
      if (!params.users_count) delete params.users_count;
      if (!params.start_date) delete params.start_date;
      if (!params.end_date) delete params.end_date;

      const response = await axios.get('/api/super-admin/tenants', { params });
      setTenants(response.data.tenants.data);
      setTenantCounts(response.data.counts || { current: 0, archived: 0 });
      setPagination({
        current_page: response.data.tenants.current_page,
        last_page: response.data.tenants.last_page,
        total: response.data.tenants.total,
        per_page: response.data.tenants.per_page || 20
      });
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
      toast.error(t('failed_fetch_tenants', 'Failed to load subscription plans'));
    } finally {
      setLoadingList(false);
    }
  };

  const handleLoginAsTenant = async (tenant) => {
    try {
      const impersonateResponse = await axios.post(`/api/super-admin/impersonate/${tenant.id}`)
      const apiTenant = impersonateResponse?.data?.tenant || {}

      const slug =
        apiTenant.slug ||
        tenant.slug ||
        (tenant.domain ? tenant.domain.split('.')[0] : null)

      if (!slug) {
        toast.error(t('tenant_missing_slug', 'Tenant is missing slug'))
        return
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('impersonateTenantSlug', slug)
      }

      await fetchCompanyInfo()
      toast.success(t('logged_in_as_tenant', 'You are now viewing this tenant workspace'))

      navigate('/dashboard')
    } catch (error) {
      console.error('Failed to login as tenant:', error)
      toast.error(t('failed_login_as_tenant', 'Failed to login as tenant'))
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [
    debouncedSearch,
    filters.plan,
    filters.status,
    filters.company_type,
    filters.country,
    filters.users_count,
    filters.start_date,
    filters.end_date,
    tenantView,
    pagination.per_page
  ]);

  useEffect(() => {
    if (isCreateRoute) {
      setShowCreateModal(true);
    }
  }, [isCreateRoute]);

  // Actions
  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
  };

  const handleCancelSubscription = async (tenant) => {
    if (!window.confirm(t('confirm_cancel_subscription', 'Are you sure you want to cancel this subscription?'))) {
      return;
    }
    try {
      await axios.put(`/api/super-admin/tenants/${tenant.id}`, { status: 'cancelled' });
      toast.success(t('subscription_cancelled', 'Subscription cancelled successfully'));
      fetchTenants(pagination.current_page);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      toast.error(t('failed_cancel_subscription', 'Failed to cancel subscription'));
    }
  };

  const handleCancelAction = async (tenant) => {
    if (tenant.archived_at) {
      toast(t('tenant_already_archived', 'This tenant is already archived.'));
      return;
    }

    if ((tenant.status || '').toLowerCase() === 'cancelled') {
      if (!window.confirm(t('confirm_archive_tenant', 'Archive this tenant and remove it from the tenants list?'))) {
        return;
      }

      try {
        await axios.post(`/api/super-admin/tenants/${tenant.id}/archive`);
        toast.success(t('tenant_archived_successfully', 'Tenant archived successfully'));
        fetchTenants(pagination.current_page);
      } catch (error) {
        console.error('Failed to archive tenant:', error);
        toast.error(
          error?.response?.data?.message ||
          t('failed_archive_tenant', 'Failed to archive tenant')
        );
      }

      return;
    }

    await handleCancelSubscription(tenant);
  };

  const handleBackupNow = async (tenant) => {
    if (tenant.tenancy_type !== 'dedicated') {
      toast.error(t('backup_only_dedicated', 'Backups are currently supported only for dedicated tenants'));
      return;
    }
    try {
      setStartingBackup(true);
      await axios.post(`/api/super-admin/tenants/${tenant.id}/backups`);
      toast.success(t('backup_started', 'Backup started'));
      fetchTenants(pagination.current_page);
      if (backupTenant && backupTenant.id === tenant.id) {
        loadBackups(tenant, backupsPage);
      }
    } catch (error) {
      console.error('Failed to start backup:', error);
      toast.error(t('backup_failed', 'Failed to start backup'));
    } finally {
      setStartingBackup(false);
    }
  };

  const loadBackups = async (tenant, page = 1) => {
    try {
      setLoadingBackup(true);
      const resp = await axios.get(`/api/super-admin/tenants/${tenant.id}/backups`, {
        params: { page }
      });
      setBackupItems(resp.data.data || []);
      setBackupsPage(resp.data.current_page || 1);
    } catch (error) {
      console.error('Failed to load backups:', error);
      toast.error(t('failed_load_backups', 'Failed to load backups'));
    } finally {
      setLoadingBackup(false);
    }
  };

  const openBackupsModal = async (tenant) => {
    setBackupTenant(tenant);
    setBackupItems([]);
    await loadBackups(tenant, 1);
  };

  const handleUpdateTenant = async (data) => {
    try {
      await axios.put(`/api/super-admin/tenants/${editingTenant.id}`, data);
      toast.success(t('tenant_updated_successfully', 'Tenant updated successfully'));
      setEditingTenant(null);
      fetchTenants(pagination.current_page);
    } catch (error) {
      console.error('Failed to update tenant:', error);
      toast.error(t('failed_update_tenant', 'Failed to update tenant'));
    }
  };

  const handleUpdateStatus = async (status) => {
    try {
      await axios.put(`/api/super-admin/tenants/${statusTenant.id}`, { status });
      toast.success(t('status_updated_successfully', 'Status updated successfully'));
      setStatusTenant(null);
      fetchTenants(pagination.current_page);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error(t('failed_update_status', 'Failed to update status'));
    }
  };

  // Create Form State
  const [loadingCreate, setLoadingCreate] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm();
  const domainSuffix = '.besouholacrm.net';
  const selectedPlan = watch('plan');
  const selectedCompanyType = watch('company_type') || 'General';
  const isLifetime = watch('is_lifetime');
  const tenancyType = watch('tenancy_type');
  const [customModules, setCustomModules] = useState([]);

  const handleModuleToggle = (moduleId) => {
    setCustomModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const onCreateSubmit = async (data) => {
    setLoadingCreate(true);
    try {
      // Map UI modules to Backend slugs
      let finalModules = [];
      if (data.plan === 'custom') {
        const companyType = data.company_type || 'General';
        const mappedModules = customModules.flatMap(m => {
          if (m === 'inventory') {
             return getInventoryModulesByCompanyType(companyType);
          }
          if (m === 'sales') return ['orders'];
          return [m];
        });
        finalModules = [...new Set(mappedModules)]; // Remove duplicates
      }

      const isLifetimeValue = !!data.is_lifetime;

      const payload = {
        name: data.company_name,
        slug: data.slug,
        domain: `${data.slug}${domainSuffix}`,
        tenancy_type: data.tenancy_type || 'shared',
        admin_name: data.admin_name,
        admin_email: data.admin_email,
        admin_password: data.password,
        plan: data.plan || 'basic',
        modules: data.plan === 'custom' ? finalModules : [],
        company_type: data.company_type || 'General',
        users_limit: data.users_limit || undefined,
        start_date: data.start_date || undefined,
        end_date: isLifetimeValue ? undefined : (data.end_date || undefined),
        is_lifetime: isLifetimeValue,
        country: data.country,
        address_line_1: data.address_line_1,
        city: data.city,
        state: data.state,
      };

      const response = await axios.post('/api/super-admin/tenants', payload);

      toast.success(t('tenant_created_successfully', 'Tenant created successfully!'));
      const fullUrl = payload.domain.startsWith('http')
        ? payload.domain
        : `http://${payload.domain}`;
      toast.success(`URL: ${fullUrl}`, { duration: 6000 });

      reset();
      closeCreateModal();
      fetchTenants();
    } catch (error) {
      console.error('Tenant creation failed:', error);
      if (error.response?.data?.errors) {
        Object.values(error.response.data.errors).flat().forEach(msg => toast.error(msg));
      } else {
        toast.error(t('tenant_creation_failed', 'Failed to create tenant.'));
      }
    } finally {
      setLoadingCreate(false);
    }
  };

  const isModalOpen = editingTenant || previewTenant || statusTenant || showCreateModal;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_10px_30px_rgba(15,23,42,0.08)]'
  }`;
  const shellClass = isDark
    ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
    : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]';
  const fieldClass = isDark
    ? 'h-10 w-full rounded-2xl border border-slate-700 bg-slate-900 text-sm text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
    : 'h-10 w-full rounded-2xl border border-slate-300 bg-white text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100';
  const labelClass = isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-900';
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const headingClass = isDark ? 'text-white' : 'text-slate-950';
  const bodyTextClass = isDark ? 'text-slate-200' : 'text-theme';
  const tabInactiveClass = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
  const tabCountInactiveClass = isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const filterIconClass = isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600';
  const filterBtnClass = isDark
    ? 'bg-blue-950/40 text-blue-300 hover:bg-blue-950/60'
    : 'bg-blue-50 text-blue-600 hover:bg-blue-100';

  if (!user?.is_super_admin) {
    return (
      <div className="p-8 text-center text-red-500">
        {t('unauthorized_access', 'Unauthorized Access')}
      </div>
    );
  }

  return (
    <>
    <div className={`relative mx-auto max-w-screen-2xl overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${shellClass}`}>
      {isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_28%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%)]" />
        </>
      )}
      {!isDark && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.75),transparent_28%)]" />
          <div className="pointer-events-none absolute -top-24 right-12 h-56 w-56 rounded-full blur-3xl bg-blue-400/12" />
          <div className="pointer-events-none absolute bottom-0 left-10 h-48 w-48 rounded-full blur-3xl bg-emerald-400/10" />
        </>
      )}
    <div className="relative z-10 space-y-5">
      {!isModalOpen && (
        <header className="flex gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${headingClass}`}>
              {t('tenant_management', 'Tenant Management')}
            </h1>
            <p className={`mt-2 text-sm max-w-2xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {t('Manage tenant subscriptions, access, and lifecycle details.')}
            </p>
          </div>
          <button
            onClick={() => navigate('/system/tenants/new')}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700"
          >
            <Plus size={16} />
            <span>{t('create_tenant', 'Create Tenant')}</span>
          </button>
        </header>
      )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTenantView('current')}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
              tenantView === 'current'
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : tabInactiveClass
            }`}
          >
            <span>{t('current_tenants', 'Current Tenants')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              tenantView === 'current' ? 'bg-white/20 text-white' : tabCountInactiveClass
            }`}>
              {tenantCounts.current}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTenantView('archived')}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
              tenantView === 'archived'
                ? isDark ? 'border-slate-600 bg-slate-800 text-white shadow-sm' : 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : tabInactiveClass
            }`}
          >
            <span>{t('archived_tenants', 'Archived Tenants')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              tenantView === 'archived' ? 'bg-white/20 text-white' : tabCountInactiveClass
            }`}>
              {tenantCounts.archived}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className={`${glassCard} p-5 md:p-6`}>
              <div className="mb-5 flex gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${filterIconClass}`}>
                    <Filter size={20} />
                  </span>
                  <div>
                    <h2 className={`text-xl font-bold ${headingClass}`}>
                      {t('Filters')}
                    </h2>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      {tenantView === 'archived'
                        ? t('Browse archived tenants without mixing them into the active list.')
                        : t('Filters apply automatically as you type or select.')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowMoreFilters((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-colors ${filterBtnClass}`}
                  >
                    <span>{showMoreFilters ? t('Hide filters') : t('More filters')}</span>
                    <ChevronDown
                      size={18}
                      className={`transition-transform ${showMoreFilters ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className={`px-2 py-2 text-xs font-medium transition-colors ${isDark ? 'text-slate-200 hover:text-white' : 'text-slate-950 hover:text-slate-600'}`}
                  >
                    {t('Reset')}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <label className={`flex items-center gap-2 ${labelClass}`}>
                      <Search className="h-4 w-4 text-blue-500" />
                      {t('search_company', 'Search')}
                    </label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder={t('search_company_name', 'Company name')}
                        className={`${fieldClass} pl-10 pr-3`}
                        value={filters.search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('status', 'Status')}
                    </label>
                    <select
                      className={`${fieldClass} px-3`}
                      value={filters.status}
                      onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                      <option value="all">{t('all_statuses', 'All Statuses')}</option>
                      <option value="active">{t('active', 'Active')}</option>
                      <option value="pending">{t('pending', 'Pending')}</option>
                      <option value="expired">{t('expired', 'Expired')}</option>
                      <option value="cancelled">{t('cancelled', 'Cancelled')}</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('plan_type', 'Plan Type')}
                    </label>
                    <select
                      className={`${fieldClass} px-3`}
                      value={filters.plan}
                      onChange={(e) => setFilters({ ...filters, plan: e.target.value })}
                    >
                      <option value="all">{t('all_plans', 'All Plans')}</option>
                      {subscriptionPlans.map((p) => (
                        <option key={p.id} value={p.code}>{t(p.name)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('company_type', 'Company Type')}
                    </label>
                    <select
                      className={`${fieldClass} px-3`}
                      value={filters.company_type}
                      onChange={(e) => setFilters({ ...filters, company_type: e.target.value })}
                    >
                      <option value="all">{t('all_company_types', 'All Company Types')}</option>
                      <option value="General">{t('General')}</option>
                      <option value="Real Estate">{t('Real Estate')}</option>
                    </select>
                  </div>
                </div>

                {showMoreFilters && (
                <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('country', 'Country')}
                    </label>
                    <select
                      className={`${fieldClass} px-3`}
                      value={filters.country}
                      onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                    >
                      <option value="all">{t('all_countries', 'All Countries')}</option>
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('start_date', 'Start Date')}
                    </label>
                    <input
                      type="date"
                      className={`${fieldClass} px-3`}
                      value={filters.start_date}
                      onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('end_date', 'End Date')}
                    </label>
                    <input
                      type="date"
                      className={`${fieldClass} px-3`}
                      value={filters.end_date}
                      onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>
                      {t('min_users', 'Min Users')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      className={`${fieldClass} px-3`}
                      placeholder={t('min_users', 'Min Users')}
                      value={filters.users_count}
                      onChange={(e) => setFilters({ ...filters, users_count: e.target.value })}
                    />
                  </div>
                </div>
                )}
              </div>
        </div>

        <div className={`${glassCard} overflow-hidden`}>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left border-collapse">
              <thead>
                <tr className={`text-xs uppercase tracking-wide ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                  <th className="p-3 font-semibold">{t('company_name', 'Company Name')}</th>
                  <th className="p-3 font-semibold">{t('country', 'Country')}</th>
                  <th className="p-3 font-semibold">{t('company_type', 'Company Type')}</th>
                  <th className="p-3 font-semibold">{t('plan_type', 'Plan Type')}</th>
                  <th className="p-3 font-semibold">{t('tenancy_type', 'Tenancy Type')}</th>
                  <th className="p-3 font-semibold text-center">{t('number_of_users', 'No. Users')}</th>
                  <th className="p-3 font-semibold">{t('start_date', 'Start Date')}</th>
                  <th className="p-3 font-semibold">{t('end_date', 'End Date')}</th>
                  <th className="p-3 font-semibold">{t('status', 'Status')}</th>
                  <th className="p-3 font-semibold text-right">{t('actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-gray-200'}`}>
                {loadingList ? (
                  <tr>
                    <td colSpan="10" className={`p-8 text-center ${bodyTextClass}`}>
                      {t('loading', 'Loading...')}
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan="10" className={`p-8 text-center ${bodyTextClass}`}>
                      {t('no_tenants_found', 'No subscriptions found.')}
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id} className={`transition-colors ${isDark ? 'hover:bg-slate-800/70' : 'hover:bg-gray-50'}`}>
                      <td className="p-3">
                        <div className={`font-medium ${bodyTextClass}`}>{tenant.name}</div>
                        <div className={`mt-0.5 text-xs ${mutedTextClass}`}>{tenant.domain || tenant.slug}</div>
                      </td>
                      <td className={`p-3 text-sm whitespace-nowrap ${bodyTextClass}`}>
                        {tenant.country || '-'}
                      </td>
                      <td className={`p-3 text-sm ${bodyTextClass}`}>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {t(tenant.company_type) || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium uppercase text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {t(planMap[tenant.subscription_plan]?.name || tenant.subscription_plan || 'N/A')}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-theme capitalize">
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800 dark:bg-violet-900 dark:text-violet-200">
                          {t(tenant.tenancy_type || 'shared')}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <Users size={13} />
                          {tenant.users_count}/{tenant.users_limit}
                        </span>
                      </td>
                      <td className={`p-3 text-sm whitespace-nowrap ${bodyTextClass}`}>
                        {formatDateOnly(tenant.start_date)}
                      </td>
                      <td className={`p-3 text-sm whitespace-nowrap ${bodyTextClass}`}>
                        {tenant.meta_data?.subscription?.is_lifetime ? t('Lifetime') : formatDateOnly(tenant.end_date)}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={tenant.status} />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            className={`${bodyTextClass} hover:text-blue-400`} 
                            title={t('preview', 'Preview')}
                            onClick={() => setPreviewTenant(tenant)}
                          >
                            <Eye size={18} />
                          </button>
                          <button 
                            className={`${bodyTextClass} hover:text-emerald-400`} 
                            title={t('password', 'Password')}
                            onClick={() => handleLoginAsTenant(tenant)}
                          >
                            <Key size={18} />
                          </button>
                          <button 
                            className={`${bodyTextClass} hover:text-blue-400`} 
                            title={t('edit', 'Edit')}
                            onClick={() => handleEdit(tenant)}
                          >
                            <Edit size={18} />
                          </button>
                          <button 
                            className={`${bodyTextClass} hover:text-purple-400`} 
                            title={t('change_status', 'Change Status')}
                            onClick={() => setStatusTenant(tenant)}
                          >
                            <Activity size={18} />
                          </button>
                          <button 
                            className={`${bodyTextClass} ${tenant.archived_at ? 'opacity-50 cursor-not-allowed' : (tenant.status || '').toLowerCase() === 'cancelled' ? 'hover:text-amber-400' : 'hover:text-red-400'}`}
                            title={tenant.archived_at ? t('archived', 'Archived') : (tenant.status || '').toLowerCase() === 'cancelled' ? t('archive', 'Archive') : t('cancel', 'Cancel')}
                            onClick={() => handleCancelAction(tenant)}
                            disabled={!!tenant.archived_at}
                          >
                            <XCircle size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            {loadingList ? (
              <div className={`p-6 text-center ${bodyTextClass}`}>
                {t('loading', 'Loading...')}
              </div>
            ) : tenants.length === 0 ? (
              <div className={`p-6 text-center ${bodyTextClass}`}>
                {t('no_tenants_found', 'No subscriptions found.')}
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {tenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    className={`rounded-xl border px-4 py-3 ${isDark ? 'border-slate-800 bg-slate-900/70' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`font-semibold ${bodyTextClass}`}>{tenant.name}</div>
                        <div className={`text-xs ${mutedTextClass}`}>{tenant.domain || tenant.slug}</div>
                      </div>
                      <StatusBadge status={tenant.status} />
                    </div>

                    <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${bodyTextClass}`}>
                      <div>
                        <span className="font-semibold">{t('company_type', 'Company Type')}</span>
                        <div className="mt-1">{t(tenant.company_type) || '-'}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold">{t('plan_type', 'Plan')}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 uppercase">
                          {t(planMap[tenant.subscription_plan]?.name || tenant.subscription_plan || 'N/A')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Building size={12} className="text-theme" />
                        <span>{t('tenancy_type', 'Tenancy Type')}: {t(tenant.tenancy_type || 'shared')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users size={12} className="text-theme" />
                        <span className="whitespace-nowrap">{tenant.users_count}/{tenant.users_limit}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={12} className="text-theme" />
                        <span>{formatDateOnly(tenant.start_date)}</span>
                      </div>
                      <div className="flex items-center gap-1 col-span-2">
                        <Calendar size={12} className="text-theme" />
                        <span>{tenant.meta_data?.subscription?.is_lifetime ? t('Lifetime') : formatDateOnly(tenant.end_date)}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        className={`${bodyTextClass} hover:text-blue-400`}
                        title={t('preview', 'Preview')}
                        onClick={() => setPreviewTenant(tenant)}
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className={`${bodyTextClass} hover:text-emerald-400`}
                        title={t('password', 'Password')}
                        onClick={() => handleLoginAsTenant(tenant)}
                      >
                        <Key size={18} />
                      </button>
                      <button
                        className={`${bodyTextClass} hover:text-blue-400`}
                        title={t('edit', 'Edit')}
                        onClick={() => handleEdit(tenant)}
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className={`${bodyTextClass} hover:text-purple-400`}
                        title={t('change_status', 'Change Status')}
                        onClick={() => setStatusTenant(tenant)}
                      >
                        <Activity size={18} />
                      </button>
                      <button
                        className={`${bodyTextClass} ${tenant.archived_at ? 'opacity-50 cursor-not-allowed' : (tenant.status || '').toLowerCase() === 'cancelled' ? 'hover:text-amber-400' : 'hover:text-red-400'}`}
                        title={tenant.archived_at ? t('archived', 'Archived') : (tenant.status || '').toLowerCase() === 'cancelled' ? t('archive', 'Archive') : t('cancel', 'Cancel')}
                        onClick={() => handleCancelAction(tenant)}
                        disabled={!!tenant.archived_at}
                      >
                        <XCircle size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className={`flex gap-4 border-t px-5 py-4 md:flex-row md:items-center md:justify-between ${isDark ? 'border-slate-800 text-slate-300' : 'border-gray-200 text-slate-600'}`}>
            <div className="text-sm">
              {t('showing_tenants_compact', 'Showing {{from}}-{{to}} of {{total}}', {
                from: pagination.total === 0 ? 0 : ((pagination.current_page - 1) * pagination.per_page) + 1,
                to: pagination.total === 0 ? 0 : Math.min(pagination.current_page * pagination.per_page, pagination.total),
                total: pagination.total
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm md:justify-end">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.current_page === 1}
                  onClick={() => fetchTenants(Math.max(1, pagination.current_page - 1))}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                  aria-label={t('previous', 'Previous')}
                >
                  <ChevronLeft size={18} />
                </button>
                <span className={`min-w-[96px] text-center font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {t('page_x_of_y', 'Page {{page}} of {{pages}}', {
                    page: Math.max(1, pagination.current_page),
                    pages: Math.max(1, pagination.last_page)
                  })}
                </span>
                <button
                  type="button"
                  disabled={pagination.current_page === pagination.last_page || pagination.total === 0}
                  onClick={() => fetchTenants(Math.min(pagination.last_page, pagination.current_page + 1))}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                  aria-label={t('next', 'Next')}
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className={mutedTextClass}>{t('per_page', 'Per page:')}</span>
                <div className="relative">
                  <select
                    value={pagination.per_page}
                    onChange={(e) => {
                      const nextPerPage = Number(e.target.value);
                      setPagination((prev) => ({
                        ...prev,
                        current_page: 1,
                        per_page: nextPerPage
                      }));
                    }}
                    className={`h-11 min-w-[88px] appearance-none rounded-xl border pl-4 pr-9 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-200 focus:ring-blue-500/20'
                        : 'border-slate-200 bg-white text-slate-700 shadow-sm'
                    }`}
                  >
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
    </div>

      {backupTenant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[150] p-4">
          <div className="card rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                {t('tenant_backups', 'Tenant Backups')} – {backupTenant.name}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setBackupTenant(null);
                  setBackupItems([]);
                }}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-theme">
                  {t('backup_hint', 'Backups are currently available for dedicated tenants database only.')}
                </div>
                <button
                  type="button"
                  onClick={() => handleBackupNow(backupTenant)}
                  className="px-3 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm disabled:opacity-50"
                  disabled={startingBackup}
                >
                  {startingBackup
                    ? t('backup_in_progress', 'Backup in progress…')
                    : t('backup_now', 'Backup Now')}
                </button>
              </div>
              {loadingBackup ? (
                <div className="p-6 text-center text-theme">
                  {t('loading', 'Loading...')}
                </div>
              ) : backupItems.length === 0 ? (
                <div className="p-6 text-center text-theme">
                  {t('no_backups_found', 'No backups found for this tenant yet.')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-700/50 text-white text-xs uppercase">
                        <th className="p-3 text-left">{t('status', 'Status')}</th>
                        <th className="p-3 text-left">{t('date', 'Date')}</th>
                        <th className="p-3 text-left">{t('size', 'Size')}</th>
                        <th className="p-3 text-left">{t('disk', 'Disk')}</th>
                        <th className="p-3 text-left">{t('actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupItems.map((b) => (
                        <tr key={b.id} className="border-t border-gray-700/40">
                          <td className="p-3">
                            <span className="text-xs font-medium">
                              {b.status}
                            </span>
                          </td>
                          <td className="p-3">
                            {b.finished_at
                              ? new Date(b.finished_at).toLocaleString()
                              : b.started_at
                                ? new Date(b.started_at).toLocaleString()
                                : '-'}
                          </td>
                          <td className="p-3">
                            {b.size_bytes
                              ? `${Math.round(b.size_bytes / 1024 / 1024)} MB`
                              : '-'}
                          </td>
                          <td className="p-3">
                            {b.disk}
                          </td>
                          <td className="p-3">
                            {b.status === 'success' && b.path && (
                              <a
                                href={`/api/super-admin/tenants/${backupTenant.id}/backups/${b.id}/download`}
                                className="text-blue-400 hover:underline text-xs"
                              >
                                {t('download', 'Download')}
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[150] p-4">
          <div className="card rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                {t('create_tenant_subscription', 'Create Tenant Subscription')}
              </h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onCreateSubmit)} className="p-6 space-y-6">
            {/* Form Content */}
            <h2 className="text-lg font-semibold mb-4 text-theme border-b pb-2">
              {t('company_details', 'Company Details')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('company_name', 'Company Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('company_name', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('enter_company_name', 'Enter Company Name')}
                />
                {errors.company_name && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('company_type', 'Company Type')} <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('company_type', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="General">{t('General')}</option>
                  <option value="Real Estate">{t('Real Estate')}</option>
                </select>
                {errors.company_type && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('tenancy_type', 'Tenancy Type')} <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('tenancy_type', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="shared">{t('shared', 'Shared')}</option>
                  <option value="dedicated">{t('dedicated', 'Dedicated')}</option>
                </select>
                {errors.tenancy_type && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('subdomain', 'Subdomain')} <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <input
                    type="text"
                    {...register('slug', { 
                      required: true,
                      pattern: /^[a-z0-9\-]+$/ 
                    })}
                    className="flex-1 px-4 py-2 border rounded-l-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                    placeholder="company-slug"
                  />
                  <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 dark:bg-gray-600 dark:border-gray-600 text-gray-500 dark:text-gray-300 text-sm">
                    {domainSuffix}
                  </span>
                </div>
                {errors.slug && <span className="text-red-500 text-xs">{t('invalid_slug', 'Invalid slug')}</span>}
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('location_details', 'Location Details')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('country', 'Country')}
                </label>
                <select
                  {...register('country')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('select_country', 'Select Country')}</option>
                  {COUNTRIES.map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('city', 'City')}
                </label>
                <input
                  type="text"
                  {...register('city')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('address_line_1', 'Address Line 1')}
                </label>
                <input
                  type="text"
                  {...register('address_line_1')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('enter_address', 'Enter street address')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('state_province', 'State / Province')}
                </label>
                <input
                  type="text"
                  {...register('state')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('admin_account', 'Admin Account')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_name', 'Admin Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('admin_name', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_email', 'Admin Email')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('admin_email', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('password', 'Password')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...register('password', { required: true, minLength: 8 })}
                    className="w-full rounded-md border px-4 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showCreatePassword ? t('Hide password') : t('Show password')}
                  >
                    {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('confirm_password', 'Confirm Password')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCreateConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...register('password_confirmation', { 
                      required: true,
                      validate: val => val === watch('password') || t('passwords_mismatch', 'Passwords do not match')
                    })}
                    className="w-full rounded-md border px-4 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreateConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showCreateConfirmPassword ? t('Hide password') : t('Show password')}
                  >
                    {showCreateConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('subscription_details', 'Subscription Details')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('number_of_users', 'Number of Users')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  {...register('users_limit', { required: true, min: 1 })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.users_limit && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('start_date', 'Start Date')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  {...register('start_date', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.start_date && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('end_date', 'End Date')} {!isLifetime && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="date"
                  {...register('end_date', {
                    validate: (value) => {
                      if (isLifetime) return true;
                      return !!value || t('required', 'This field is required');
                    }
                  })}
                  disabled={!!isLifetime}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                {errors.end_date && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
                <div className="mt-2 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('is_lifetime')}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-xs text-theme">
                    {t('lifetime_subscription', 'Lifetime subscription')}
                  </span>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('select_plan', 'Select Plan')}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {selectablePlans.map((plan) => (
                <label
                  key={plan.id}
                  className={`relative flex flex-col rounded-lg border p-4 cursor-pointer transition-all duration-200 ${
                    selectedPlan === plan.code
                      ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-200 dark:border-transparent dark:bg-blue-900/20 dark:ring-2 dark:ring-blue-500'
                      : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm dark:border-gray-700 dark:bg-transparent dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <input
                      type="radio"
                      value={plan.code}
                      {...register('plan')}
                      defaultChecked={plan.code === 'basic'}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-3 font-bold text-theme">
                      {t(plan.name)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 ml-7">
                    {(() => {
                      const base = getPlanModulesForCompany(plan, selectedCompanyType)
                      if (base.length === 0) return t('Flexible Selection')
                      return base
                        .map((m) => {
                          const found = AVAILABLE_MODULES.find(x => x.id === m)
                          return t(found?.name || String(m))
                        })
                        .join(', ')
                    })()}
                  </p>
                </label>
              ))}
            </div>

            {selectedPlan === 'custom' && (
              <div className="mt-6 p-4 bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-theme mb-3">{t('select_modules', 'Select Modules')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {AVAILABLE_MODULES.map(module => {
                    const isContractCollectionsBlocked = module.id === 'contract_collections' && selectedCompanyType !== 'Real Estate'
                    const isCustomersBlocked = module.id === 'customers' && selectedCompanyType === 'Real Estate'
                    const isDisabled = isContractCollectionsBlocked || isCustomersBlocked

                    return (
                    <label key={module.id} className={`flex items-center space-x-2 cursor-pointer ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={isDisabled}
                        checked={customModules.includes(module.id)}
                        onChange={() => {
                          if (isDisabled) return
                          handleModuleToggle(module.id)
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-theme">
                        {t(module.name)}
                        {module.id === 'contract_collections' ? (selectedCompanyType === 'Real Estate' ? '' : ` (${t('Real Estate')})`) : ''}
                        {module.id === 'customers' ? (selectedCompanyType === 'Real Estate' ? ` (${t('General')})` : '') : ''}
                      </span>
                    </label>
                  )})}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={loadingCreate}
                className={`px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loadingCreate ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loadingCreate ? t('creating', 'Creating...') : t('create_tenant', 'Create Tenant')}
              </button>
            </div>
          </form>
          </div>
        </div>
      )}

      {editingTenant && (
        <EditTenantModal 
          tenant={editingTenant} 
          plans={selectablePlans}
          onClose={() => setEditingTenant(null)} 
          onSave={handleUpdateTenant} 
        />
      )}

      {previewTenant && (
        <PreviewTenantModal 
          tenant={previewTenant} 
          onClose={() => setPreviewTenant(null)} 
        />
      )}

      {statusTenant && (
        <ChangeStatusModal 
          tenant={statusTenant} 
          onClose={() => setStatusTenant(null)} 
          onSave={handleUpdateStatus} 
        />
      )}
    </>
  );
};

const PreviewTenantModal = ({ tenant, onClose }) => {
  const { t } = useTranslation();
  const { planMap } = useSubscriptionPlans({ includeInactive: true });
  const plan = planMap[tenant.subscription_plan] || { name: tenant.subscription_plan };
  const isLifetime =
    tenant?.meta_data &&
    tenant.meta_data.subscription &&
    tenant.meta_data.subscription.is_lifetime;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[150] p-4">
      <div className="card rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center  bg-transparent z-10">
          <h3 className="text-lg font-bold text-theme">
            {t('subscription_preview', 'Subscription Preview')} - {tenant.name}
          </h3>
          <button onClick={onClose} className="text-theme hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-8">
          {/* Company Details */}
          <div>
            <h4 className="text-md font-semibold text-blue-600 dark:text-blue-400 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              {t('company_details', 'Company Details')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('company_name', 'Company Name')}</span>
                <span className="font-medium text-theme">{tenant.name}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('company_type', 'Company Type')}</span>
                <span className="font-medium text-theme">{tenant.company_type || '-'}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('tenancy_type', 'Tenancy Type')}</span>
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                    (tenant.tenancy_type || 'shared') === 'dedicated'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  {t(tenant.tenancy_type || 'shared')}
                </span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('subdomain', 'Subdomain')}</span>
                <span className="font-medium text-theme">{tenant.domain || `${tenant.slug}.besouholacrm.net`}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('created_at', 'Created At')}</span>
                <span className="font-medium text-theme">{new Date(tenant.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Location Details */}
          <div>
            <h4 className="text-md font-semibold text-blue-600 dark:text-blue-400 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              {t('location_details', 'Location Details')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('country', 'Country')}</span>
                <span className="font-medium text-theme">{tenant.country || '-'}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('city', 'City')}</span>
                <span className="font-medium text-theme">{tenant.city || '-'}</span>
              </div>
              <div className="md:col-span-2">
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('address', 'Address')}</span>
                <span className="font-medium text-theme">
                  {[tenant.address_line_1, tenant.state].filter(Boolean).join(', ') || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Admin Account */}
          <div>
            <h4 className="text-md font-semibold text-blue-600 dark:text-blue-400 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              {t('admin_account', 'Admin Account')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('admin_name', 'Admin Name')}</span>
                <span className="font-medium text-theme">
                  {tenant.admin_name || (tenant.owner ? tenant.owner.name : '-')}
                </span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('admin_email', 'Admin Email')}</span>
                <span className="font-medium text-theme">
                  {tenant.admin_email || (tenant.owner ? tenant.owner.email : '-')}
                </span>
              </div>
            </div>
          </div>

          {/* Subscription Details */}
          <div>
            <h4 className="text-md font-semibold text-blue-600 dark:text-blue-400 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              {t('subscription_details', 'Subscription Details')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('plan', 'Plan')}</span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 uppercase inline-block mt-1">
                  {t(plan.name)}
                </span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('status', 'Status')}</span>
                <div className="mt-1"><StatusBadge status={tenant.status} /></div>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('users_limit', 'Users Limit')}</span>
                <span className="font-medium text-theme">{tenant.users_limit}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('start_date', 'Start Date')}</span>
                <span className="font-medium text-theme">{formatDateOnly(tenant.start_date)}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-400 dark:text-gray-400">{t('end_date', 'End Date')}</span>
                <span className="font-medium text-theme">
                  {isLifetime
                    ? t('lifetime_subscription', 'Lifetime subscription')
                    : tenant.end_date
                      ? formatDateOnly(tenant.end_date)
                      : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Modules */}
          {tenant.modules && tenant.modules.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-blue-600 dark:text-blue-400 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                {t('modules', 'Modules')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {tenant.modules.map((module, index) => (
                  <span key={index} className="px-3 py-1 bg-gray-700/50 text-theme rounded-full text-sm">
                    {t(module.slug || module)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 dark:bg-gray-700  dark:hover:bg-gray-600"
          >
            {t('close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

const ChangeStatusModal = ({ tenant, onClose, onSave }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(tenant.status);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[150] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            {t('change_status', 'Change Status')}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t('change_status_desc', 'Select the new status for')} <span className="font-semibold text-gray-900 dark:text-white">{tenant.name}</span>
          </p>
          <div className="space-y-2">
            {['active', 'pending', 'expired', 'cancelled'].map((s) => (
              <label key={s} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${status === s ? 'ring-2 ring-blue-500 border-transparent bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={status === s}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 font-medium text-gray-900 dark:text-white capitalize">{t(s)}</span>
                <span className="ml-auto">
                   <StatusBadge status={s} />
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button 
            onClick={() => onSave(status)}
            className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {t('save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditTenantModal = ({ tenant, plans, onClose, onSave }) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const domainSuffix = '.besouholacrm.net';
  
  // Custom Modules State
  const [customModules, setCustomModules] = useState(
    tenant.subscription_plan === 'custom' && tenant.modules 
      ? tenant.modules.map(m => typeof m === 'string' ? m : m.slug || m)
      : []
  );

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      company_name: tenant.name,
      company_type: tenant.company_type || 'General',
      slug: tenant.slug || (tenant.domain ? tenant.domain.split('.')[0] : ''),
      country: tenant.country,
      city: tenant.city,
      address_line_1: tenant.address_line_1,
      state: tenant.state,
      admin_name: tenant.admin_name || (tenant.owner?.name),
      admin_email: tenant.admin_email || (tenant.owner?.email),
      users_limit: tenant.users_limit,
      start_date: toDateInputValue(tenant.start_date),
      end_date: toDateInputValue(tenant.end_date),
      plan: tenant.subscription_plan || 'basic',
      status: tenant.status,
      is_lifetime: tenant.meta_data?.subscription?.is_lifetime || false
    }
  });

  const selectedPlan = watch('plan');
  const selectedCompanyType = watch('company_type') || (tenant?.company_type || 'General');
  const isLifetime = watch('is_lifetime');
  const password = watch('password');

  const handleModuleToggle = (moduleId) => {
    setCustomModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      // Process modules
      let finalModules = [];
      if (data.plan === 'custom') {
        const companyType = data.company_type || 'General';
        const mappedModules = customModules.flatMap(m => {
          if (m === 'inventory') {
             return getInventoryModulesByCompanyType(companyType);
          }
          if (m === 'sales') return ['orders'];
          return [m];
        });
        finalModules = [...new Set(mappedModules)];
      }

      const isLifetimeValue = !!data.is_lifetime;

      const payload = {
        name: data.company_name,
        slug: data.slug,
        subscription_plan: data.plan || tenant.subscription_plan,
        company_type: data.company_type,
        status: data.status,
        country: data.country,
        city: data.city,
        state: data.state,
        address_line_1: data.address_line_1,
        admin_name: data.admin_name,
        admin_email: data.admin_email,
        users_limit: data.users_limit,
        start_date: data.start_date || undefined,
        end_date: isLifetimeValue ? undefined : (data.end_date || undefined),
        is_lifetime: isLifetimeValue,
        modules: data.plan === 'custom' ? finalModules : [],
      };

      if (data.password) {
        payload.admin_password = data.password;
      }

      await onSave(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[150] p-4">
      <div className="card rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-bold text-black">
            {t('edit_subscription', 'Edit Subscription')} - {tenant.name}
          </h3>
          <button onClick={onClose} className="text-black hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Company Details */}
            <h2 className="text-lg font-semibold mb-4 text-theme border-b pb-2">
              {t('company_details', 'Company Details')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('company_name', 'Company Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('company_name', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('enter_company_name', 'Enter Company Name')}
                />
                {errors.company_name && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('company_type', 'Company Type')} <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('company_type', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 text-theme focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="General">{t('General')}</option>
                  <option value="Real Estate">{t('Real Estate')}</option>
                </select>
                {errors.company_type && <span className="text-red-500 text-xs">{t('required', 'This field is required')}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('subdomain', 'Subdomain')} <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <input
                    type="text"
                    {...register('slug', { 
                      required: true,
                      pattern: /^[a-z0-9\-]+$/ 
                    })}
                    className="flex-1 px-4 py-2 border rounded-l-md dark:bg-gray-700 dark:border-gray-600 text-theme focus:ring-blue-500 focus:border-blue-500"
                    placeholder="company-slug"
                  />
                  <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 dark:bg-gray-600 dark:border-gray-600 text-black text-sm">
                    {domainSuffix}
                  </span>
                </div>
                {errors.slug && <span className="text-red-500 text-xs">{t('invalid_slug', 'Invalid slug')}</span>}
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('location_details', 'Location Details')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('country', 'Country')}
                </label>
                <select
                  {...register('country')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('select_country', 'Select Country')}</option>
                  {COUNTRIES.map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('city', 'City')}
                </label>
                <input
                  type="text"
                  {...register('city')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('address_line_1', 'Address Line 1')}
                </label>
                <input
                  type="text"
                  {...register('address_line_1')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('enter_address', 'Enter street address')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('state_province', 'State / Province')}
                </label>
                <input
                  type="text"
                  {...register('state')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('admin_account', 'Admin Account')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_name', 'Admin Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('admin_name', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_email', 'Admin Email')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('admin_email', { required: true })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('password', 'New Password')} <span className="text-gray-400 text-xs">({t('optional', 'Optional')})</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    {...register('password', { minLength: 8 })}
                    className="w-full rounded-md border px-4 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                    placeholder={t('leave_blank_to_keep', 'Leave blank to keep current')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showEditPassword ? t('Hide password') : t('Show password')}
                  >
                    {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('confirm_password', 'Confirm New Password')}
                </label>
                <div className="relative">
                  <input
                    type={showEditConfirmPassword ? 'text' : 'password'}
                    {...register('password_confirmation', { 
                      validate: val => !password || val === password || t('passwords_mismatch', 'Passwords do not match')
                    })}
                    className="w-full rounded-md border px-4 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showEditConfirmPassword ? t('Hide password') : t('Show password')}
                  >
                    {showEditConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('subscription_details', 'Subscription Details')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('number_of_users', 'Number of Users')}
                </label>
                <input
                  type="number"
                  {...register('users_limit', { min: 1 })}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('start_date', 'Start Date')}
                </label>
                <input
                  type="date"
                  {...register('start_date')}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('end_date', 'End Date')}
                </label>
                <input
                  type="date"
                  {...register('end_date')}
                  disabled={isLifetime}
                  className="w-full px-4 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <div className="mt-2 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('is_lifetime')}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-xs text-theme">
                    {t('lifetime_subscription', 'Lifetime subscription')}
                  </span>
                </div>
              </div>
            </div>
            
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('status', 'Status')}
                </label>
                <select 
                  {...register('status')}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="active">{t('active', 'Active')}</option>
                  <option value="pending">{t('pending', 'Pending')}</option>
                  <option value="expired">{t('expired', 'Expired')}</option>
                  <option value="cancelled">{t('cancelled', 'Cancelled')}</option>
                </select>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('select_plan', 'Select Plan')}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <label
                  key={plan.id}
                  className={`relative flex flex-col rounded-lg border p-4 cursor-pointer transition-all duration-200 ${
                    selectedPlan === plan.code
                      ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-200 dark:border-transparent dark:bg-blue-900/20 dark:ring-2 dark:ring-blue-500'
                      : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm dark:border-gray-700 dark:bg-transparent dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <input
                      type="radio"
                      value={plan.code}
                      {...register('plan')}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-3 font-bold text-theme">
                      {t(plan.name)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 ml-7">
                    {(() => {
                      const base = getPlanModulesForCompany(plan, selectedCompanyType)
                      if (base.length === 0) return t('Flexible Selection')
                      return base
                        .map((m) => {
                          const found = AVAILABLE_MODULES.find(x => x.id === m)
                          return t(found?.name || String(m))
                        })
                        .join(', ')
                    })()}
                  </p>
                </label>
              ))}
            </div>

            {selectedPlan === 'custom' && (
              <div className="mt-6 p-4 bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-theme mb-3">{t('select_modules', 'Select Modules')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {AVAILABLE_MODULES.map(module => {
                    const isContractCollectionsBlocked = module.id === 'contract_collections' && selectedCompanyType !== 'Real Estate'
                    const isCustomersBlocked = module.id === 'customers' && selectedCompanyType === 'Real Estate'
                    const isDisabled = isContractCollectionsBlocked || isCustomersBlocked

                    return (
                    <label key={module.id} className={`flex items-center space-x-2 cursor-pointer ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={isDisabled}
                        checked={customModules.includes(module.id)}
                        onChange={() => {
                          if (isDisabled) return
                          handleModuleToggle(module.id)
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-theme">
                        {t(module.name)}
                        {module.id === 'contract_collections' ? (selectedCompanyType === 'Real Estate' ? '' : ` (${t('Real Estate')})`) : ''}
                        {module.id === 'customers' ? (selectedCompanyType === 'Real Estate' ? ` (${t('General')})` : '') : ''}
                      </span>
                    </label>
                  )})}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 space-x-2">
              <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? t('saving', 'Saving...') : t('save_changes', 'Save Changes')}
              </button>
            </div>
        </form>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const styles = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const statusKey = (status || 'pending').toLowerCase();
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${styles[statusKey] || styles.pending}`}>
      {t(statusKey)}
    </span>
  );
};

export default TenantSetup;
