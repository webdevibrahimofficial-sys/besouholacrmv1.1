import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { api as axios } from '@utils/api';
import { isSecureQuickSwitchEnabled } from '@utils/features';
import { impersonationApi } from '@features/Impersonation/impersonationApi';
import { useSubscriptionPlans, getPlanModulesForCompany } from '../../hooks/useSubscriptionPlans';
import { useAppState } from '../../shared/context/AppStateProvider';
import { useTheme } from '../../shared/context/ThemeProvider';
import { AVAILABLE_MODULES } from '../../hooks/useTenants';
import {
  Plus, 
  Filter, 
  Search, 
  Users, 
  LogIn, 
  Eye, 
  EyeOff,
  Activity, 
  Edit, 
  XCircle,
  Building,
  Calendar,
  Globe,
  MapPin,
  Mail,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Wallet,
} from 'lucide-react';

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

const PRIORITY_COUNTRIES = ['Egypt', 'Saudi Arabia', 'United Arab Emirates', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Jordan', 'Lebanon'];

const PAYMENT_METHODS = [
  { value: 'bank_transfer', labelKey: 'bank_transfer', fallback: 'Bank Transfer' },
  { value: 'instapay', labelKey: 'instapay', fallback: 'InstaPay / Fawry' },
  { value: 'card', labelKey: 'card', fallback: 'Card / Visa' },
  { value: 'cash', labelKey: 'cash', fallback: 'Cash' },
  { value: 'gateway', labelKey: 'gateway', fallback: 'Payment Gateway' },
];

const DEFAULT_TENANT_FILTERS = {
  search: '',
  tenant_id: '',
  plan: 'all',
  status: 'all',
  company_type: 'all',
  country: 'all',
  users_count: '',
  user_usage: 'all',
  start_date: '',
  end_date: '',
  expiration_from: '',
  expiration_to: '',
  payment_method: 'all',
};

const hasAdvancedTenantFilters = (filterState = {}) => (
  filterState.country !== 'all' ||
  filterState.user_usage !== 'all' ||
  Boolean(filterState.users_count) ||
  Boolean(filterState.start_date) ||
  Boolean(filterState.end_date) ||
  Boolean(filterState.expiration_from) ||
  Boolean(filterState.expiration_to) ||
  filterState.payment_method !== 'all'
);

const buildTenantListSearchParams = (view, filterState, searchValue) => {
  const params = new URLSearchParams();
  params.set('view', view || 'current');

  const entries = {
    search: searchValue,
    tenant_id: filterState.tenant_id,
    plan: filterState.plan,
    status: filterState.status,
    company_type: filterState.company_type,
    country: filterState.country,
    users_count: filterState.users_count,
    user_usage: filterState.user_usage,
    start_date: filterState.start_date,
    end_date: filterState.end_date,
    expiration_from: filterState.expiration_from,
    expiration_to: filterState.expiration_to,
    payment_method: filterState.payment_method,
  };

  Object.entries(entries).forEach(([key, value]) => {
    if (value && value !== 'all') {
      params.set(key, value);
    }
  });

  return params;
};

const getInventoryModulesByCompanyType = (companyType = 'General') => {
  if (companyType === 'Real Estate') {
    return ['projects', 'properties', 'developers', 'brokers', 'requests'];
  }

  return ['items', 'orders'];
};

const normalizeCustomModulesForEditor = (rawModules, companyType = 'General') => {
  const modules = (Array.isArray(rawModules) ? rawModules : [])
    .map((module) => (typeof module === 'string' ? module : module?.slug || module?.id || ''))
    .filter(Boolean);

  const inventoryModules = getInventoryModulesByCompanyType(companyType);
  const hasAnyInventoryModule = inventoryModules.some((module) => modules.includes(module));
  const normalized = modules.filter((module) => !inventoryModules.includes(module));

  if (hasAnyInventoryModule) {
    normalized.push('inventory');
  }

  return [...new Set(normalized)];
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

const getTenantDomainDisplay = (tenant) => tenant?.domain || '-';

const findReferencePlanPrice = (prices, planCode, billingCycle = 'monthly') => {
  if (!Array.isArray(prices) || !planCode) return null;
  return prices.find((price) => (
    price?.plan_code === planCode &&
    price?.billing_cycle === billingCycle &&
    price?.is_active !== false
  )) || null;
};

const buildTransactionPayload = (data, fallbackBillingCycle = 'monthly') => {
  const amount = String(data?.transaction_amount ?? '').trim();
  const currency = String(data?.transaction_currency ?? '').trim().toUpperCase();

  if (!amount) {
    return null;
  }

  return {
    amount: Number(amount),
    currency: currency || 'EGP',
    billing_cycle: data?.transaction_billing_cycle || fallbackBillingCycle,
    payment_method: data?.transaction_payment_method || undefined,
    notes: data?.transaction_notes || undefined,
  };
};

const TenantSetup = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, fetchCompanyInfo } = useAppState();
  const secureQuickSwitchEnabled = isSecureQuickSwitchEnabled();
  const { plans: subscriptionPlans, planMap } = useSubscriptionPlans({ includeInactive: true });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [tenantView, setTenantView] = useState('current');

  // Debounce search to avoid API call on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef(null);
  const skipNextUrlSync = useRef(false);
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
  const [filters, setFilters] = useState({ ...DEFAULT_TENANT_FILTERS });
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
  const [planPrices, setPlanPrices] = useState([]);
  const isCreateRoute = location.pathname === '/system/tenants/new';

  useEffect(() => {
    if (isCreateRoute) return;

    const params = new URLSearchParams(location.search);
    const nextView = params.get('view') || 'current';
    const nextFilters = {
      search: params.get('search') || '',
      tenant_id: params.get('tenant_id') || '',
      plan: params.get('plan') || 'all',
      status: params.get('status') || 'all',
      company_type: params.get('company_type') || 'all',
      country: params.get('country') || 'all',
      users_count: params.get('users_count') || '',
      user_usage: params.get('user_usage') || 'all',
      start_date: params.get('start_date') || '',
      end_date: params.get('end_date') || '',
      expiration_from: params.get('expiration_from') || '',
      expiration_to: params.get('expiration_to') || '',
      payment_method: params.get('payment_method') || 'all',
    };

    console.log('📍 URL changed. nextFilters:', nextFilters);
    skipNextUrlSync.current = true;
    setTenantView((prev) => (prev === nextView ? prev : nextView));
    setFilters(nextFilters);
    setDebouncedSearch(nextFilters.search);
    if (hasAdvancedTenantFilters(nextFilters)) {
      setShowMoreFilters(true);
    }
    setPagination((prev) => ({ ...prev, current_page: 1 }));
  }, [location.search, isCreateRoute]);

  useEffect(() => {
    if (isCreateRoute) return;
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }

    const params = buildTenantListSearchParams(tenantView, filters, debouncedSearch);
    const nextSearch = params.toString();
    const currentSearch = location.search.replace(/^\?/, '');

    if (nextSearch !== currentSearch) {
      navigate(`/system/tenants?${nextSearch}`, { replace: true });
    }
  }, [
    debouncedSearch,
    filters,
    tenantView,
    isCreateRoute,
    navigate,
    location.search,
  ]);

  // Fetch tenants when URL changes
  useEffect(() => {
    if (isCreateRoute) return;
    
    const params = new URLSearchParams(location.search);
    const urlFilters = {
      search: params.get('search') || '',
      tenant_id: params.get('tenant_id') || '',
      plan: params.get('plan') || 'all',
      status: params.get('status') || 'all',
      company_type: params.get('company_type') || 'all',
      country: params.get('country') || 'all',
      users_count: params.get('users_count') || '',
      user_usage: params.get('user_usage') || 'all',
      start_date: params.get('start_date') || '',
      end_date: params.get('end_date') || '',
      expiration_from: params.get('expiration_from') || '',
      expiration_to: params.get('expiration_to') || '',
      payment_method: params.get('payment_method') || 'all',
    };
    const urlView = params.get('view') || 'current';
    
    console.log('🔍 URL changed - Fetching with filters:', urlFilters);
    setLoadingList(true);
    
    (async () => {
      try {
        const reqParams = {
          page: 1,
          view: urlView,
          per_page: pagination.per_page,
          ...urlFilters,
        };
        
        // Clean up 'all' and empty filters
        if (reqParams.plan === 'all') delete reqParams.plan;
        if (reqParams.status === 'all') delete reqParams.status;
        if (reqParams.company_type === 'all') delete reqParams.company_type;
        if (reqParams.country === 'all') delete reqParams.country;
        if (reqParams.user_usage === 'all') delete reqParams.user_usage;
        if (reqParams.payment_method === 'all') delete reqParams.payment_method;
        if (!reqParams.tenant_id) delete reqParams.tenant_id;
        if (!reqParams.users_count) delete reqParams.users_count;
        if (!reqParams.start_date) delete reqParams.start_date;
        if (!reqParams.end_date) delete reqParams.end_date;
        if (!reqParams.expiration_from) delete reqParams.expiration_from;
        if (!reqParams.expiration_to) delete reqParams.expiration_to;

        console.log('📤 Sending API request with params:', reqParams);
        const response = await axios.get('/api/super-admin/tenants', { params: reqParams });
        console.log('📥 Response received:', response.data.tenants.data.length, 'items');
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
    })();
  }, [location.search, isCreateRoute]);

  const resetFilters = () => {
    clearTimeout(debounceTimer.current);
    setDebouncedSearch('');
    setFilters({ ...DEFAULT_TENANT_FILTERS });
    setShowMoreFilters(false);

    if (!isCreateRoute) {
      navigate(`/system/tenants?view=${tenantView}`, { replace: true });
    }
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
      if (params.user_usage === 'all') delete params.user_usage;
      if (params.payment_method === 'all') delete params.payment_method;
      if (!params.tenant_id) delete params.tenant_id;
      if (!params.users_count) delete params.users_count;
      if (!params.start_date) delete params.start_date;
      if (!params.end_date) delete params.end_date;
      if (!params.expiration_from) delete params.expiration_from;
      if (!params.expiration_to) delete params.expiration_to;

      const response = await axios.get('/api/super-admin/tenants', { params });
      console.log('✅ Tenants fetched with status filter:', params.status, 'Data received:', response.data.tenants.data.length);
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
      if (secureQuickSwitchEnabled) {
        const reason = window.prompt(t('Optional support access reason'), '') || ''
        const response = await impersonationApi.start(tenant.id, {
          mode: 'support_access',
          reason,
        })
        const redirectUrl = response?.data?.redirect_url

        if (!redirectUrl) {
          toast.error(t('failed_login_as_tenant', 'Failed to login as tenant'))
          return
        }

        if (typeof window !== 'undefined') {
          window.localStorage.setItem('impersonateTenantSlug', tenant.slug || '')
          window.location.href = redirectUrl
        }
        return
      }

      toast.error(t('Support access is temporarily unavailable'))
    } catch (error) {
      console.error('Failed to login as tenant:', error)
      toast.error(t('failed_login_as_tenant', 'Failed to login as tenant'))
    }
  };

  useEffect(() => {
    const loadPlanPrices = async () => {
      try {
        const response = await axios.get('/api/super-admin/plan-prices');
        setPlanPrices(Array.isArray(response.data?.prices) ? response.data.prices : []);
      } catch (error) {
        console.error('Failed to load plan prices:', error);
      }
    };

    loadPlanPrices();
  }, []);

  useEffect(() => {
    if (isCreateRoute) {
      setShowCreateModal(true);
    }
  }, [isCreateRoute]);

  // Actions
  const handleEdit = (tenant) => {
    setEditingTenant({
      ...tenant,
      admin_name: tenant.admin_name || tenant.owner?.name || '',
      admin_email: tenant.admin_email || tenant.owner?.email || '',
    });
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
  const selectedBillingCycle = watch('transaction_billing_cycle') || 'monthly';
  const transactionAmount = watch('transaction_amount');
  const transactionCurrency = watch('transaction_currency');
  const tenancyType = watch('tenancy_type');
  const [customModules, setCustomModules] = useState([]);

  const handleModuleToggle = (moduleId) => {
    setCustomModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  useEffect(() => {
    const referencePrice = findReferencePlanPrice(planPrices, selectedPlan, selectedBillingCycle);
    if (!referencePrice) return;

    if (!transactionAmount) {
      setValue('transaction_amount', String(referencePrice.list_price));
    }

    if (!transactionCurrency) {
      setValue('transaction_currency', referencePrice.currency || 'EGP');
    }
  }, [planPrices, selectedPlan, selectedBillingCycle, setValue, transactionAmount, transactionCurrency]);

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

      const transactionPayload = buildTransactionPayload(data);
      if (transactionPayload) {
        payload.transaction = transactionPayload;
      }

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

        <div className="flex flex-wrap items-center gap-2 mt-4">
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
                {filters.tenant_id ? (
                  <div className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium ${isDark ? 'border-blue-500/30 bg-blue-500/10 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                    <span>{t('Exact tenant filter active')}</span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 font-semibold text-current">
                      #{filters.tenant_id}
                    </span>
                  </div>
                ) : null}
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
                <div className="space-y-4 border-t border-dashed border-slate-200 pt-4 dark:border-slate-700">
                  <div>
                    <h3 className={`text-sm font-semibold ${headingClass}`}>
                      {t('creation_date', 'Creation Date')}
                    </h3>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      {t('filter_by_account_creation_period', 'Filter companies by when their account was created.')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Calendar className="h-4 w-4 text-blue-500" />
                        {t('creation_date_from', 'From')}
                      </label>
                      <input
                        type="date"
                        className={`${fieldClass} px-3`}
                        value={filters.start_date}
                        onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Calendar className="h-4 w-4 text-blue-500" />
                        {t('creation_date_to', 'To')}
                      </label>
                      <input
                        type="date"
                        className={`${fieldClass} px-3`}
                        value={filters.end_date}
                        onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className={`text-sm font-semibold ${headingClass}`}>
                      {t('expiration_date', 'Subscription Expiration')}
                    </h3>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      {t('filter_by_subscription_expiration_period', 'Find companies whose subscription ends within a specific period.')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Calendar className="h-4 w-4 text-amber-500" />
                        {t('expiration_date_from', 'Expires From')}
                      </label>
                      <input
                        type="date"
                        className={`${fieldClass} px-3`}
                        value={filters.expiration_from}
                        onChange={(e) => setFilters({ ...filters, expiration_from: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Calendar className="h-4 w-4 text-amber-500" />
                        {t('expiration_date_to', 'Expires To')}
                      </label>
                      <input
                        type="date"
                        className={`${fieldClass} px-3`}
                        value={filters.expiration_to}
                        onChange={(e) => setFilters({ ...filters, expiration_to: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className={`text-sm font-semibold ${headingClass}`}>
                      {t('advanced_filters', 'Advanced Filters')}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Globe className="h-4 w-4 text-blue-500" />
                        {t('country', 'Country / Region')}
                      </label>
                      <select
                        className={`${fieldClass} px-3`}
                        value={filters.country}
                        onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                      >
                        <option value="all">{t('all_countries', 'All Countries')}</option>
                        <optgroup label={t('priority_markets', 'Priority Markets')}>
                          {PRIORITY_COUNTRIES.map((country) => (
                            <option key={`priority-${country}`} value={country}>{country}</option>
                          ))}
                        </optgroup>
                        <optgroup label={t('all_countries', 'All Countries')}>
                          {COUNTRIES.filter((country) => !PRIORITY_COUNTRIES.includes(country)).map((country) => (
                            <option key={country} value={country}>{country}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Wallet className="h-4 w-4 text-emerald-500" />
                        {t('payment_method', 'Payment Method')}
                      </label>
                      <select
                        className={`${fieldClass} px-3`}
                        value={filters.payment_method}
                        onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}
                      >
                        <option value="all">{t('all_payment_methods', 'All Payment Methods')}</option>
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method.value} value={method.value}>
                            {t(method.labelKey, method.fallback)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 ${labelClass}`}>
                        <Users className="h-4 w-4 text-violet-500" />
                        {t('user_usage', 'User Limit / Usage')}
                      </label>
                      <select
                        className={`${fieldClass} px-3`}
                        value={filters.user_usage}
                        onChange={(e) => setFilters({ ...filters, user_usage: e.target.value })}
                      >
                        <option value="all">{t('all_user_usage', 'All Usage Levels')}</option>
                        <option value="at_limit">{t('users_at_limit', 'At maximum users (upgrade candidates)')}</option>
                        <option value="near_limit">{t('users_near_limit', 'Near limit (90% or more)')}</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className={`block ${labelClass}`}>
                        {t('min_users', 'Minimum Users')}
                      </label>
                      <input
                        type="number"
                        min="0"
                        className={`${fieldClass} px-3`}
                        placeholder={t('min_users_placeholder', 'e.g. 3')}
                        value={filters.users_count}
                        onChange={(e) => setFilters({ ...filters, users_count: e.target.value })}
                      />
                    </div>
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
                        <div className={`mt-0.5 text-xs ${mutedTextClass}`}>{getTenantDomainDisplay(tenant)}</div>
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
                            title={t('login_as_tenant', 'Login as tenant')}
                            aria-label={t('login_as_tenant', 'Login as tenant')}
                            onClick={() => handleLoginAsTenant(tenant)}
                          >
                            <LogIn size={18} />
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
                        <div className={`text-xs ${mutedTextClass}`}>{getTenantDomainDisplay(tenant)}</div>
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
                        title={t('login_as_tenant', 'Login as tenant')}
                        aria-label={t('login_as_tenant', 'Login as tenant')}
                        onClick={() => handleLoginAsTenant(tenant)}
                      >
                        <LogIn size={18} />
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

      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 md:p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-4xl max-h-[84vh] overflow-y-auto rounded-2xl border shadow-2xl ${
              isDark
                ? 'border-slate-700/70 bg-slate-900 text-slate-100'
                : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className={`sticky top-0 z-10 flex items-center justify-between border-b p-4 ${
              isDark
                ? 'border-slate-700 bg-slate-900'
                : 'border-gray-200 bg-white'
            }`}>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                {t('create_tenant_subscription', 'Create Tenant Subscription')}
              </h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className={`${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-5 p-4 md:p-5">
            {/* Form Content */}
            <h2 className="text-lg font-semibold mb-4 text-theme border-b pb-2">
              {t('company_details', 'Company Details')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('company_name', 'Company Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('company_name', { required: true })}
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                    className="h-10 flex-1 rounded-l-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                    placeholder="company-slug"
                  />
                    <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-300">
                    {domainSuffix}
                  </span>
                </div>
                {errors.slug && <span className="text-red-500 text-xs">{t('invalid_slug', 'Invalid slug')}</span>}
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('location_details', 'Location Details')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('country', 'Country')}
                </label>
                <select
                  {...register('country')}
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('address_line_1', 'Address Line 1')}
                </label>
                <input
                  type="text"
                  {...register('address_line_1')}
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('admin_account', 'Admin Account')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_name', 'Admin Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('admin_name', { required: true })}
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_email', 'Admin Email')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('admin_email', { required: true })}
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                    className="h-10 w-full rounded-md border px-3 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowCreatePassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showCreatePassword ? t('Hide password') : t('Show password')}
                    title={showCreatePassword ? t('Hide password') : t('Show password')}
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
                    className="h-10 w-full rounded-md border px-3 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowCreateConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showCreateConfirmPassword ? t('Hide password') : t('Show password')}
                    title={showCreateConfirmPassword ? t('Hide password') : t('Show password')}
                  >
                    {showCreateConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('subscription_details', 'Subscription Details')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('number_of_users', 'Number of Users')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  {...register('users_limit', { required: true, min: 1 })}
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
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
                  className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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
              {t('contract_pricing', 'Contract & Pricing')}
            </h2>
            <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50/80'}`}>
              <p className={`mb-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {t('record_payment_help', 'Optional: record a payment for this tenant creation and create the initial contract automatically.')}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('amount', 'Amount')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('transaction_amount')}
                    className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('currency', 'Currency')}
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="EGP"
                    {...register('transaction_currency')}
                    className="h-10 w-full rounded-md border px-3 py-2 uppercase dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('billing_cycle', 'Billing Cycle')}
                  </label>
                  <select
                    {...register('transaction_billing_cycle')}
                    className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                    defaultValue="monthly"
                  >
                    <option value="monthly">{t('monthly', 'Monthly')}</option>
                    <option value="yearly">{t('yearly', 'Yearly')}</option>
                    <option value="lifetime">{t('lifetime', 'Lifetime')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('payment_method', 'Payment Method')}
                  </label>
                  <select
                    {...register('transaction_payment_method')}
                    className="h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">{t('select', 'Select')}</option>
                    <option value="bank_transfer">{t('bank_transfer', 'Bank Transfer')}</option>
                    <option value="instapay">{t('instapay', 'InstaPay')}</option>
                    <option value="cash">{t('cash', 'Cash')}</option>
                    <option value="card">{t('card', 'Card')}</option>
                    <option value="gateway">{t('gateway', 'Gateway')}</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('notes', 'Notes')}
                </label>
                <textarea
                  rows={3}
                  {...register('transaction_notes')}
                  className="w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  placeholder={t('payment_notes_placeholder', 'Internal note for the contract / payment record')}
                />
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2">
              {t('select_plan', 'Select Plan')}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {selectablePlans.map((plan) => {
                const isSelected = selectedPlan === plan.code;

                return (
                <label
                  key={plan.id}
                  className={`relative flex flex-col rounded-xl border p-3 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? isDark
                        ? 'border-blue-500 bg-blue-950/30 shadow-sm ring-1 ring-blue-500/40'
                        : 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-200'
                      : isDark
                        ? 'border-slate-700 bg-slate-900/70 hover:border-blue-500/40 hover:bg-slate-800/80'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm'
                  }`}
                >
                  <input
                    type="radio"
                    value={plan.code}
                    {...register('plan')}
                    defaultChecked={plan.code === 'basic'}
                    className="sr-only"
                  />
                  <span
                    className={`absolute end-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-bold transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : isDark
                          ? 'border-slate-600 bg-slate-800 text-transparent'
                          : 'border-slate-300 bg-white text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <div className="mb-2 flex items-center gap-3">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : isDark
                            ? 'border-slate-500 bg-slate-800 text-transparent'
                            : 'border-slate-300 bg-white text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-theme'}`}>
                      {t(plan.name)}
                    </span>
                  </div>
                  <p className={`ml-7 text-xs leading-5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
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
              )})}
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
                 className={`rounded-md bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${loadingCreate ? 'cursor-not-allowed opacity-50' : ''}`}
               >
                {loadingCreate ? t('creating', 'Creating...') : t('create_tenant', 'Create Tenant')}
              </button>
            </div>
          </form>
          </div>
        </div>,
        document.body
      )}

      {editingTenant && (
        <EditTenantModal 
          key={`edit-tenant-${editingTenant.id}-${editingTenant.updated_at || ''}`}
          tenant={editingTenant} 
          plans={selectablePlans}
          planPrices={planPrices}
          onClose={() => setEditingTenant(null)} 
          onSave={handleUpdateTenant}
          onTenantChanged={() => fetchTenants(pagination.current_page)}
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { planMap } = useSubscriptionPlans({ includeInactive: true });
  const [contracts, setContracts] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const plan = planMap[tenant.subscription_plan] || { name: tenant.subscription_plan };
  const isLifetime =
    tenant?.meta_data &&
    tenant.meta_data.subscription &&
    tenant.meta_data.subscription.is_lifetime;
  const subdomain = getTenantDomainDisplay(tenant);
  const createdAt = tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : '-';
  const locationLine = [tenant.city, tenant.state, tenant.country].filter(Boolean).join(', ') || '-';
  const infoCardClass = isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white';
  const labelClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const valueClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const sectionTitleClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const detailItemClass = isDark ? 'border-slate-800/80 bg-slate-950/40' : 'border-slate-200 bg-slate-50/80';
  const modules = Array.isArray(tenant.modules) ? tenant.modules : [];

  useEffect(() => {
    const loadContracts = async () => {
      try {
        setContractsLoading(true);
        const response = await axios.get(`/api/super-admin/tenants/${tenant.id}/contracts`);
        setContracts(Array.isArray(response.data?.contracts) ? response.data.contracts : []);
      } catch (error) {
        console.error('Failed to load contracts preview:', error);
      } finally {
        setContractsLoading(false);
      }
    };

    loadContracts();
  }, [tenant.id]);

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 md:p-4 backdrop-blur-sm">
      <div
        className={`w-full max-w-5xl max-h-[88vh] overflow-y-auto rounded-3xl border shadow-2xl ${
          isDark
            ? 'border-slate-700/70 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div
          className={`sticky top-0 z-10 flex items-center justify-between border-b p-4 ${
            isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
          }`}
        >
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {t('subscription_preview', 'Subscription Preview')} - {tenant.name} <StatusBadge status={tenant.status} />
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-6 p-4 md:p-6">
          <div
            className={`overflow-hidden rounded-3xl border p-5 md:p-6 ${
              isDark
                ? 'border-slate-800 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950'
                : 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60'
            }`}
          >
            <div className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className=" min-w-0">
                  
                  <div className={`mt-3 flex flex-wrap items-center gap-3 text-sm ${labelClass}`}>
                    <span className="inline-flex items-center gap-2">
                      <Globe size={15} />
                      {subdomain}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Calendar size={15} />
                      {t('created_at', 'Created At')}: {createdAt}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className={`rounded-2xl border p-4 ${infoCardClass}`}>
                  <div className={`text-xs font-medium uppercase tracking-[0.18em] ${labelClass}`}>
                    {t('plan', 'Plan')}
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{t(plan.name)}</div>
                </div>
                <div className={`rounded-2xl border p-4 ${infoCardClass}`}>
                  <div className={`text-xs font-medium uppercase tracking-[0.18em] ${labelClass}`}>
                    {t('users_limit', 'Users Limit')}
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{tenant.users_limit || '-'}</div>
                </div>
                <div className={`rounded-2xl border p-4 ${infoCardClass}`}>
                  <div className={`text-xs font-medium uppercase tracking-[0.18em] ${labelClass}`}>
                    {t('tenancy_type', 'Tenancy Type')}
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{t(tenant.tenancy_type || 'shared')}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className={`rounded-3xl border p-5 md:p-6 ${infoCardClass}`}>
              <div className="mb-5 flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                  <Building size={18} />
                </div>
                <div>
                  <h4 className={`text-lg font-semibold ${sectionTitleClass}`}>{t('company_details', 'Company Details')}</h4>
                  <p className={`text-sm ${labelClass}`}>{t('Core company and subscription identity')}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [t('company_name', 'Company Name'), tenant.name],
                  [t('company_type', 'Company Type'), tenant.company_type || '-'],
                  [t('subdomain', 'Subdomain'), subdomain],
                  [t('plan', 'Plan'), t(plan.name)],
                  [t('start_date', 'Start Date'), formatDateOnly(tenant.start_date)],
                  [t('end_date', 'End Date'), isLifetime ? t('lifetime_subscription', 'Lifetime subscription') : (tenant.end_date ? formatDateOnly(tenant.end_date) : '-')],
                ].map(([label, value]) => (
                  <div key={label} className={`rounded-2xl border p-4 ${detailItemClass}`}>
                    <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{label}</div>
                    <div className={`mt-2 text-sm font-semibold break-words ${valueClass}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className={`rounded-3xl border p-5 md:p-6 ${infoCardClass}`}>
                <div className="mb-5 flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                    <Mail size={18} />
                  </div>
                  <div>
                    <h4 className={`text-lg font-semibold ${sectionTitleClass}`}>{t('admin_account', 'Admin Account')}</h4>
                    <p className={`text-sm ${labelClass}`}>{t('Primary workspace owner details')}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className={`rounded-2xl border p-4 ${detailItemClass}`}>
                    <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('admin_name', 'Admin Name')}</div>
                    <div className={`mt-2 text-sm font-semibold ${valueClass}`}>
                      {tenant.admin_name || (tenant.owner ? tenant.owner.name : '-')}
                    </div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${detailItemClass}`}>
                    <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('admin_email', 'Admin Email')}</div>
                    <div className={`mt-2 text-sm font-semibold break-all ${valueClass}`}>
                      {tenant.admin_email || (tenant.owner ? tenant.owner.email : '-')}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-3xl border p-5 md:p-6 ${infoCardClass}`}>
                <div className="mb-5 flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                    <MapPin size={18} />
                  </div>
                  <div>
                    <h4 className={`text-lg font-semibold ${sectionTitleClass}`}>{t('location_details', 'Location Details')}</h4>
                    <p className={`text-sm ${labelClass}`}>{t('Registered operating location')}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className={`rounded-2xl border p-4 ${detailItemClass}`}>
                    <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('location', 'Location')}</div>
                    <div className={`mt-2 text-sm font-semibold ${valueClass}`}>{locationLine}</div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${detailItemClass}`}>
                    <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('address', 'Address')}</div>
                    <div className={`mt-2 text-sm font-semibold ${valueClass}`}>
                      {[tenant.address_line_1, tenant.state].filter(Boolean).join(', ') || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {tenant.current_contract && (
                <div className={`rounded-3xl border p-5 md:p-6 ${infoCardClass}`}>
                  <div className="mb-5">
                    <h4 className={`text-lg font-semibold ${sectionTitleClass}`}>{t('contract_pricing', 'Contract & Pricing')}</h4>
                    <p className={`text-sm ${labelClass}`}>{t('Current negotiated contract details')}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      [t('plan', 'Plan'), tenant.current_contract.plan_code || '-'],
                      [t('amount', 'Amount'), tenant.current_contract.agreed_amount != null ? `${tenant.current_contract.agreed_amount} ${tenant.current_contract.currency || ''}`.trim() : '-'],
                      [t('billing_cycle', 'Billing Cycle'), tenant.current_contract.billing_cycle || '-'],
                      [t('effective_from', 'Effective From'), tenant.current_contract.effective_from ? formatDateOnly(tenant.current_contract.effective_from) : '-'],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-2xl border p-4 ${detailItemClass}`}>
                        <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{label}</div>
                        <div className={`mt-2 text-sm font-semibold break-words ${valueClass}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`rounded-3xl border p-5 md:p-6 ${infoCardClass}`}>
                <div className="mb-5">
                  <h4 className={`text-lg font-semibold ${sectionTitleClass}`}>{t('contract_history', 'Contract History')}</h4>
                  <p className={`text-sm ${labelClass}`}>{t('Timeline of negotiated contract versions for this tenant')}</p>
                </div>
                {contractsLoading ? (
                  <p className={`text-sm ${labelClass}`}>{t('Loading...')}</p>
                ) : contracts.length === 0 ? (
                  <p className={`text-sm ${labelClass}`}>{t('No contracts found yet.')}</p>
                ) : (
                  <div className="space-y-3">
                    {contracts.map((contract) => (
                      <div key={contract.id} className={`rounded-2xl border p-4 ${detailItemClass}`}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <div>
                            <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('plan', 'Plan')}</div>
                            <div className={`mt-2 text-sm font-semibold ${valueClass}`}>{contract.plan_code}</div>
                          </div>
                          <div>
                            <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('amount', 'Amount')}</div>
                            <div className={`mt-2 text-sm font-semibold ${valueClass}`}>{contract.agreed_amount} {contract.currency}</div>
                          </div>
                          <div>
                            <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('billing_cycle', 'Billing Cycle')}</div>
                            <div className={`mt-2 text-sm font-semibold ${valueClass}`}>{contract.billing_cycle}</div>
                          </div>
                          <div>
                            <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('from', 'From')}</div>
                            <div className={`mt-2 text-sm font-semibold ${valueClass}`}>{contract.effective_from ? formatDateOnly(contract.effective_from) : '-'}</div>
                          </div>
                          <div>
                            <div className={`text-xs font-medium uppercase tracking-[0.16em] ${labelClass}`}>{t('to', 'To')}</div>
                            <div className={`mt-2 text-sm font-semibold ${valueClass}`}>{contract.effective_to ? formatDateOnly(contract.effective_to) : t('Active')}</div>
                          </div>
                        </div>
                        {contract.notes ? (
                          <p className={`mt-3 text-xs leading-5 ${labelClass}`}>{contract.notes}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {modules.length > 0 && (
            <div className={`rounded-3xl border p-5 md:p-6 ${infoCardClass}`}>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h4 className={`text-lg font-semibold ${sectionTitleClass}`}>{t('modules', 'Modules')}</h4>
                  <p className={`text-sm ${labelClass}`}>{t('Enabled workspace capabilities')}</p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                  <Users size={14} />
                  {modules.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {modules.map((module, index) => (
                  <span
                    key={index}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      isDark
                        ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'
                        : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                    }`}
                  >
                    {t(module.slug || module)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`flex justify-end border-t p-4 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
          <button 
            onClick={onClose}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isDark
                ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('close', 'Close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ChangeStatusModal = ({ tenant, onClose, onSave }) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [status, setStatus] = useState(tenant.status);
  const statusDescriptions = {
    active: t('Tenant can access the platform normally.'),
    pending: t('Tenant is created but not fully active yet.'),
    expired: t('Tenant access is blocked because the subscription ended.'),
    cancelled: t('Tenant is cancelled and access will remain blocked.'),
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 md:p-4 backdrop-blur-sm">
      <div
        className={`w-full max-w-4xl max-h-[84vh] overflow-y-auto rounded-2xl border shadow-2xl ${
          isDark
            ? 'border-slate-700/70 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div
          className={`sticky top-0 z-10 flex items-center justify-between border-b p-4 ${
            isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
          }`}
        >
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {t('change_status', 'Change Status')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 p-4 md:p-5">
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
            {t('change_status_desc', 'Select the new status for')} <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{tenant.name}</span>
          </p>
          <div className="space-y-2">
            {['active', 'pending', 'expired', 'cancelled'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                  status === s
                    ? isDark
                      ? 'border-blue-400/70 bg-blue-500/10 shadow-sm ring-1 ring-blue-400/60'
                      : 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-200'
                    : isDark
                      ? 'border-slate-700 bg-slate-800/80 hover:border-slate-500 hover:bg-slate-800'
                      : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      status === s
                        ? 'border-blue-500 bg-blue-500'
                        : isDark
                          ? 'border-slate-500 bg-transparent'
                          : 'border-slate-300 bg-white'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${status === s ? 'bg-white' : 'bg-transparent'}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-sm font-semibold capitalize ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {t(s)}
                      </p>
                      <span className="shrink-0">
                        <StatusBadge status={s} />
                      </span>
                    </div>
                    <p className={`mt-1 pr-2 text-xs leading-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {statusDescriptions[s]}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-3 border-t pt-4 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-md px-5 py-2.5 text-sm font-medium transition-colors ${
                isDark
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => onSave(status)}
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const EditTenantModal = ({ tenant, plans, planPrices, onClose, onSave, onTenantChanged }) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractSubmitting, setContractSubmitting] = useState(false);
  const domainSuffix = '.besouholacrm.net';
  const fieldClass = 'h-10 w-full rounded-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500';
  const sectionTitleClass = 'text-lg font-semibold mb-4 mt-6 text-theme border-b pb-2';
  
  // Custom Modules State
  const [customModules, setCustomModules] = useState(
    tenant.subscription_plan === 'custom' && tenant.modules 
      ? normalizeCustomModulesForEditor(tenant.modules, tenant.company_type || 'General')
      : []
  );

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
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
      is_lifetime: tenant.meta_data?.subscription?.is_lifetime || false,
      transaction_billing_cycle: tenant.current_contract?.billing_cycle || 'monthly',
      transaction_currency: tenant.current_contract?.currency || '',
      manual_contract_plan_code: tenant.current_contract?.plan_code || tenant.subscription_plan || 'basic',
      manual_contract_currency: tenant.current_contract?.currency || 'EGP',
      manual_contract_billing_cycle: tenant.current_contract?.billing_cycle || 'monthly',
      manual_contract_amount: tenant.current_contract?.agreed_amount || '',
      manual_contract_effective_from: toDateInputValue(tenant.current_contract?.effective_from || tenant.start_date),
      manual_contract_notes: '',
    }
  });

  useEffect(() => {
    reset({
      company_name: tenant.name,
      company_type: tenant.company_type || 'General',
      slug: tenant.slug || (tenant.domain ? tenant.domain.split('.')[0] : ''),
      country: tenant.country,
      city: tenant.city,
      address_line_1: tenant.address_line_1,
      state: tenant.state,
      admin_name: tenant.admin_name || tenant.owner?.name || '',
      admin_email: tenant.admin_email || tenant.owner?.email || '',
      users_limit: tenant.users_limit,
      start_date: toDateInputValue(tenant.start_date),
      end_date: toDateInputValue(tenant.end_date),
      plan: tenant.subscription_plan || 'basic',
      status: tenant.status,
      is_lifetime: tenant.meta_data?.subscription?.is_lifetime || false,
      transaction_billing_cycle: tenant.current_contract?.billing_cycle || 'monthly',
      transaction_currency: tenant.current_contract?.currency || '',
      transaction_amount: '',
      transaction_payment_method: '',
      transaction_notes: '',
      manual_contract_plan_code: tenant.current_contract?.plan_code || tenant.subscription_plan || 'basic',
      manual_contract_currency: tenant.current_contract?.currency || 'EGP',
      manual_contract_billing_cycle: tenant.current_contract?.billing_cycle || 'monthly',
      manual_contract_amount: tenant.current_contract?.agreed_amount || '',
      manual_contract_effective_from: toDateInputValue(tenant.current_contract?.effective_from || tenant.start_date),
      manual_contract_notes: '',
      password: '',
      confirm_password: '',
    });

    setValue('admin_name', tenant.admin_name || tenant.owner?.name || '', { shouldDirty: false });
    setValue('admin_email', tenant.admin_email || tenant.owner?.email || '', { shouldDirty: false });
    setCustomModules(
      tenant.subscription_plan === 'custom' && tenant.modules
        ? normalizeCustomModulesForEditor(tenant.modules, tenant.company_type || 'General')
        : []
    );
  }, [tenant, reset, setValue]);

  const selectedPlan = watch('plan');
  const selectedCompanyType = watch('company_type') || (tenant?.company_type || 'General');
  const isLifetime = watch('is_lifetime');
  const password = watch('password');
  const selectedBillingCycle = watch('transaction_billing_cycle') || 'monthly';
  const transactionAmount = watch('transaction_amount');
  const transactionCurrency = watch('transaction_currency');
  const manualContractPlanCode = watch('manual_contract_plan_code');
  const manualContractBillingCycle = watch('manual_contract_billing_cycle') || 'monthly';
  const manualContractAmount = watch('manual_contract_amount');
  const manualContractCurrency = watch('manual_contract_currency');

  const loadContracts = useCallback(async () => {
    try {
      setContractsLoading(true);
      const response = await axios.get(`/api/super-admin/tenants/${tenant.id}/contracts`);
      setContracts(Array.isArray(response.data?.contracts) ? response.data.contracts : []);
    } catch (error) {
      console.error('Failed to load contracts:', error);
      toast.error(t('failed_load_contracts', 'Failed to load contract history'));
    } finally {
      setContractsLoading(false);
    }
  }, [tenant.id, t]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  const handleModuleToggle = (moduleId) => {
    setCustomModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  useEffect(() => {
    const referencePrice = findReferencePlanPrice(planPrices, selectedPlan, selectedBillingCycle);
    if (!referencePrice) return;

    if (!transactionAmount) {
      setValue('transaction_amount', String(referencePrice.list_price));
    }

    if (!transactionCurrency) {
      setValue('transaction_currency', referencePrice.currency || 'EGP');
    }
  }, [planPrices, selectedPlan, selectedBillingCycle, setValue, transactionAmount, transactionCurrency]);

  useEffect(() => {
    const referencePrice = findReferencePlanPrice(planPrices, manualContractPlanCode, manualContractBillingCycle);
    if (!referencePrice) return;

    if (!manualContractAmount) {
      setValue('manual_contract_amount', String(referencePrice.list_price));
    }

    if (!manualContractCurrency) {
      setValue('manual_contract_currency', referencePrice.currency || 'EGP');
    }
  }, [planPrices, manualContractPlanCode, manualContractBillingCycle, setValue, manualContractAmount, manualContractCurrency]);

  const handleCreateManualContract = async () => {
    const payload = {
      plan_code: manualContractPlanCode || selectedPlan || tenant.subscription_plan,
      currency: manualContractCurrency || 'EGP',
      billing_cycle: manualContractBillingCycle,
      agreed_amount: Number(manualContractAmount || 0),
      effective_from: watch('manual_contract_effective_from') || toDateInputValue(tenant.start_date),
      notes: watch('manual_contract_notes') || undefined,
    };

    if (!payload.plan_code || !payload.currency || !payload.agreed_amount || !payload.effective_from) {
      toast.error(t('Please complete the manual contract form first.'));
      return;
    }

    try {
      setContractSubmitting(true);
      await axios.post(`/api/super-admin/tenants/${tenant.id}/contracts`, payload);
      toast.success(t('Contract created successfully.'));
      setValue('manual_contract_notes', '');
      await loadContracts();
      if (typeof onTenantChanged === 'function') {
        onTenantChanged();
      }
    } catch (error) {
      console.error('Failed to create contract:', error);
      const message = error?.response?.data?.message || Object.values(error?.response?.data?.errors || {}).flat()[0];
      toast.error(message || t('Failed to create contract.'));
    } finally {
      setContractSubmitting(false);
    }
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

      const transactionPayload = buildTransactionPayload(
        data,
        tenant.current_contract?.billing_cycle || 'monthly',
      );
      if (transactionPayload) {
        payload.transaction = transactionPayload;
      }

      if (data.password) {
        payload.admin_password = data.password;
      }

      await onSave(payload);
      if (payload.transaction) {
        toast.success(t('Contract & Pricing saved to the database.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 md:p-4 backdrop-blur-sm">
      <div
        className={`w-full max-w-4xl max-h-[84vh] overflow-y-auto rounded-2xl border shadow-2xl ${
          isDark
            ? 'border-slate-700/70 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div
          className={`sticky top-0 z-10 flex items-center justify-between border-b p-4 ${
            isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
          }`}
        >
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {t('edit_subscription', 'Edit Subscription')} - {tenant.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4 md:p-5">
            {/* Company Details */}
            <h2 className="text-lg font-semibold mb-4 text-theme border-b pb-2">
              {t('company_details', 'Company Details')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('company_name', 'Company Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('company_name', { required: true })}
                  className={fieldClass}
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
                  className={fieldClass}
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
                    className="h-10 flex-1 rounded-l-md border px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                    placeholder="company-slug"
                  />
                  <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-300">
                    {domainSuffix}
                  </span>
                </div>
                {errors.slug && <span className="text-red-500 text-xs">{t('invalid_slug', 'Invalid slug')}</span>}
              </div>
            </div>

            <h2 className={sectionTitleClass}>
              {t('location_details', 'Location Details')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('country', 'Country')}
                </label>
                <select
                  {...register('country')}
                  className={fieldClass}
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
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('address_line_1', 'Address Line 1')}
                </label>
                <input
                  type="text"
                  {...register('address_line_1')}
                  className={fieldClass}
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
                  className={fieldClass}
                />
              </div>
            </div>

            <h2 className={sectionTitleClass}>
              {t('admin_account', 'Admin Account')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_name', 'Admin Name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('admin_name', { required: true })}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('admin_email', 'Admin Email')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register('admin_email', { required: true })}
                  className={fieldClass}
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
                    className="h-10 w-full rounded-md border px-3 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('leave_blank_to_keep', 'Leave blank to keep current')}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowEditPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showEditPassword ? t('Hide password') : t('Show password')}
                    title={showEditPassword ? t('Hide password') : t('Show password')}
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
                    className="h-10 w-full rounded-md border px-3 py-2 pr-11 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-blue-500 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowEditConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-gray-300 dark:hover:text-blue-400"
                    aria-label={showEditConfirmPassword ? t('Hide password') : t('Show password')}
                    title={showEditConfirmPassword ? t('Hide password') : t('Show password')}
                  >
                    {showEditConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <h2 className={sectionTitleClass}>
              {t('subscription_details', 'Subscription Details')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
               <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('number_of_users', 'Number of Users')}
                </label>
                <input
                  type="number"
                  {...register('users_limit', { min: 1 })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('start_date', 'Start Date')}
                </label>
                <input
                  type="date"
                  {...register('start_date')}
                  className={fieldClass}
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
                  className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-60`}
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

            <h2 className={sectionTitleClass}>
              {t('contract_pricing', 'Contract & Pricing')}
            </h2>
            {tenant.current_contract && (
              <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50/80'}`}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme">{t('plan', 'Plan')}</div>
                    <div className="mt-1 text-sm font-semibold text-theme">{tenant.current_contract.plan_code || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme">{t('amount', 'Amount')}</div>
                    <div className="mt-1 text-sm font-semibold text-theme">
                      {tenant.current_contract.agreed_amount != null
                        ? `${tenant.current_contract.agreed_amount} ${tenant.current_contract.currency || ''}`.trim()
                        : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme">{t('billing_cycle', 'Billing Cycle')}</div>
                    <div className="mt-1 text-sm font-semibold text-theme">{tenant.current_contract.billing_cycle || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-theme">{t('effective_from', 'Effective From')}</div>
                    <div className="mt-1 text-sm font-semibold text-theme">{tenant.current_contract.effective_from ? formatDateOnly(tenant.current_contract.effective_from) : '-'}</div>
                  </div>
                </div>
              </div>
            )}
            <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50/80'}`}>
              <p className={`mb-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {t('record_payment_edit_help', 'Optional: record a payment for this change. When provided, a new contract version is created automatically.')}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('amount', 'Amount')}
                  </label>
                  <input type="number" step="0.01" {...register('transaction_amount')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('currency', 'Currency')}
                  </label>
                  <input type="text" maxLength={3} placeholder="EGP" {...register('transaction_currency')} className={`${fieldClass} uppercase`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('billing_cycle', 'Billing Cycle')}
                  </label>
                  <select {...register('transaction_billing_cycle')} className={fieldClass} defaultValue={tenant.current_contract?.billing_cycle || 'monthly'}>
                    <option value="monthly">{t('monthly', 'Monthly')}</option>
                    <option value="yearly">{t('yearly', 'Yearly')}</option>
                    <option value="lifetime">{t('lifetime', 'Lifetime')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">
                    {t('payment_method', 'Payment Method')}
                  </label>
                  <select {...register('transaction_payment_method')} className={fieldClass}>
                    <option value="">{t('select', 'Select')}</option>
                    <option value="bank_transfer">{t('bank_transfer', 'Bank Transfer')}</option>
                    <option value="instapay">{t('instapay', 'InstaPay')}</option>
                    <option value="cash">{t('cash', 'Cash')}</option>
                    <option value="card">{t('card', 'Card')}</option>
                    <option value="gateway">{t('gateway', 'Gateway')}</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-theme mb-1">
                  {t('notes', 'Notes')}
                </label>
                <textarea rows={3} {...register('transaction_notes')} className={fieldClass.replace('h-10 ', '')} />
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50/80'}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-theme">{t('manual_contract', 'Create Contract Without Payment')}</h3>
                  <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {t('Use this when you want to update the negotiated contract without recording a transaction.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateManualContract}
                  disabled={contractSubmitting}
                  className={`rounded-md bg-emerald-600 px-4 py-2 text-sm text-white ${contractSubmitting ? 'cursor-not-allowed opacity-60' : 'hover:bg-emerald-700'}`}
                >
                  {contractSubmitting ? t('saving', 'Saving...') : t('Create Contract')}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">{t('plan', 'Plan')}</label>
                  <select {...register('manual_contract_plan_code')} className={fieldClass}>
                    {plans.map((plan) => (
                      <option key={plan.code} value={plan.code}>{t(plan.name)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">{t('currency', 'Currency')}</label>
                  <input type="text" maxLength={3} {...register('manual_contract_currency')} className={`${fieldClass} uppercase`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">{t('billing_cycle', 'Billing Cycle')}</label>
                  <select {...register('manual_contract_billing_cycle')} className={fieldClass}>
                    <option value="monthly">{t('monthly', 'Monthly')}</option>
                    <option value="yearly">{t('yearly', 'Yearly')}</option>
                    <option value="lifetime">{t('lifetime', 'Lifetime')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">{t('amount', 'Amount')}</label>
                  <input type="number" step="0.01" {...register('manual_contract_amount')} className={fieldClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme mb-1">{t('effective_from', 'Effective From')}</label>
                  <input type="date" {...register('manual_contract_effective_from')} className={fieldClass} />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="block text-sm font-medium text-theme mb-1">{t('notes', 'Notes')}</label>
                  <textarea rows={3} {...register('manual_contract_notes')} className={fieldClass.replace('h-10 ', '')} />
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50/80'}`}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-theme">{t('contract_history', 'Contract History')}</h3>
                <button type="button" onClick={loadContracts} className={`text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                  {t('Refresh')}
                </button>
              </div>
              {contractsLoading ? (
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('Loading...')}</p>
              ) : contracts.length === 0 ? (
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('No contracts found yet.')}</p>
              ) : (
                <div className="space-y-3">
                  {contracts.map((contract) => (
                    <div key={contract.id} className={`rounded-xl border p-3 ${isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-theme">{t('plan', 'Plan')}</div>
                          <div className="mt-1 text-sm font-semibold text-theme">{contract.plan_code}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-theme">{t('amount', 'Amount')}</div>
                          <div className="mt-1 text-sm font-semibold text-theme">{contract.agreed_amount} {contract.currency}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-theme">{t('cycle', 'Cycle')}</div>
                          <div className="mt-1 text-sm font-semibold text-theme">{contract.billing_cycle}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-theme">{t('from', 'From')}</div>
                          <div className="mt-1 text-sm font-semibold text-theme">{contract.effective_from ? formatDateOnly(contract.effective_from) : '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-theme">{t('to', 'To')}</div>
                          <div className="mt-1 text-sm font-semibold text-theme">{contract.effective_to ? formatDateOnly(contract.effective_to) : t('Active')}</div>
                        </div>
                      </div>
                      {contract.notes && (
                        <p className={`mt-3 text-xs leading-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{contract.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('status', 'Status')}
                </label>
                <select 
                  {...register('status')}
                  className={fieldClass}
                >
                  <option value="active">{t('active', 'Active')}</option>
                  <option value="pending">{t('pending', 'Pending')}</option>
                  <option value="expired">{t('expired', 'Expired')}</option>
                  <option value="cancelled">{t('cancelled', 'Cancelled')}</option>
                </select>
            </div>

            <h2 className={sectionTitleClass}>
              {t('select_plan', 'Select Plan')}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {plans.map((plan) => {
                const isSelected = selectedPlan === plan.code;
                const titleClass = isSelected
                  ? isDark
                    ? 'text-white'
                    : 'text-slate-900'
                  : isDark
                    ? 'text-slate-100'
                    : 'text-slate-900';
                const bodyClass = isSelected
                  ? isDark
                    ? 'text-slate-200'
                    : 'text-slate-700'
                  : isDark
                    ? 'text-slate-300'
                    : 'text-slate-500';

                return (
                <label
                  key={plan.id}
                  className={`relative flex flex-col rounded-lg border p-4 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? isDark
                        ? 'border-blue-400/70 bg-blue-500/10 shadow-sm ring-1 ring-blue-400/60'
                        : 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-200'
                      : isDark
                        ? 'border-slate-700 bg-slate-800/80 hover:border-slate-500 hover:bg-slate-800'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm'
                  }`}
                >
                  <input
                    type="radio"
                    value={plan.code}
                    {...register('plan')}
                    className="sr-only"
                  />
                  <span
                    className={`absolute end-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-bold transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : isDark
                          ? 'border-slate-600 bg-slate-800 text-transparent'
                          : 'border-slate-300 bg-white text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <div className="mb-2 flex items-center gap-3">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : isDark
                            ? 'border-slate-500 bg-slate-800 text-transparent'
                            : 'border-slate-300 bg-white text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className={`font-bold ${titleClass}`}>
                      {t(plan.name)}
                    </span>
                  </div>
                  <p className={`ml-7 text-xs ${bodyClass}`}>
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
                );
              })}
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

            <div className="flex justify-end space-x-2 pt-4">
              <button 
                type="button" 
                onClick={onClose}
                className="rounded-md bg-gray-100 px-4 py-2 text-gray-600 hover:bg-gray-200"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 ${isSubmitting ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {isSubmitting ? t('saving', 'Saving...') : t('save_changes', 'Save Changes')}
              </button>
            </div>
        </form>
      </div>
    </div>,
    document.body
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
