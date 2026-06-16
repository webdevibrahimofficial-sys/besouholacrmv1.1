import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '@shared/context/AppStateProvider'
import { api } from '@utils/api';
import { useTranslation } from 'react-i18next'
import { User, Info, Lock, Bell, Check, X, Settings, Target, AlertCircle, Eye, EyeOff, Upload, ChevronDown, Clock, Calendar, TrendingUp, Percent, ChevronUp, Loader2 } from 'lucide-react';
import SearchableSelect from '@components/SearchableSelect';
import { 
  ROLES, 
  STATUSES, 
  PERMISSIONS, 
  REPORT_MODULES, 
  PERM_LABELS_AR, 
  ROLE_HIERARCHY 
} from '@features/Users/constants.js';

const formatPermissionLabel = (label) => {
  if (!label) return '';
  if (label === 'checkInOutApprovals') return 'Check In & Out Approvals';
  const withSpaces = label.replace(/([A-Z])/g, ' $1').trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const normalizeRoleValue = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeSelectValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

const normalizeTenantCompanyType = (...values) => {
  const normalized = values
    .map(value => String(value || '').trim().toLowerCase())
    .find(Boolean)

  if (!normalized) return ''
  if (normalized.includes('general')) return 'general'
  if (normalized.includes('real')) return 'realestate'

  return normalized.replace(/[\s_]+/g, '')
}

const isSalesPersonRole = (role) => {
  const r = normalizeRoleValue(role);
  return r === 'sales person' || r === 'salesperson';
};

const isAdminRole = (role) => {
  const r = normalizeRoleValue(role);
  return r === 'admin' || r === 'tenant admin' || r === 'super admin';
};

const getRoleFilteredPermissions = (group, perms, role) => {
  const list = Array.isArray(perms) ? perms : [];

  if (!isSalesPersonRole(role)) {
    return list;
  }

  if (group === 'Leads') {
    const hiddenLeadPerms = new Set(['viewDuplicateLeads', 'actOnDuplicateLeads']);
    return list.filter(perm => !hiddenLeadPerms.has(perm));
  }

  if (group === 'Inventory') {
    const hiddenInventoryPerms = new Set([
      'addProject',
      'exportProject',
      'revertSoldProperty',
      'deleteInventory',
      'addDeveloper',
    ]);
    return list.filter(perm => !hiddenInventoryPerms.has(perm));
  }

  return list;
};

const ARABIC_DIGIT_MAP = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const normalizeNumericInput = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/[\u0660-\u0669]/g, (digit) => ARABIC_DIGIT_MAP[digit] || digit)
    .replace(/[,\u066C]/g, '')
    .replace(/[^\d.-]/g, '');
};

const formatNumericDisplay = (value, locale = 'en-US', options = {}) => {
  const normalized = normalizeNumericInput(value);
  if (!normalized) return '';
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return '';

  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(parsed);
};

const buildSelectAllPermissions = (filterInventoryPermsByTenantType) => {
  const perms = {};
  Object.entries(PERMISSIONS).forEach(([group, list]) => {
    const filtered =
      group === 'Inventory' ? filterInventoryPermsByTenantType(list) : list;
    if (filtered.length > 0) {
      perms[group] = [...filtered];
    }
  });
  perms.Reports = REPORT_MODULES.flatMap((module) => [
    `${module}_show`,
    `${module}_export`,
  ]);
  return perms;
};

export default function UserManagementUserCreate({ onClose, onSuccess, user }) {
  const { t, i18n } = useTranslation()
  const { crmSettings, company } = useAppState()
  const isArabic = i18n.language === 'ar'
  const navigate = useNavigate();
  const isEdit = !!user;

  const currencySymbol = crmSettings?.defaultCurrency || crmSettings?.default_currency || 'SAR'
  const tenantTypeNorm = normalizeTenantCompanyType(
    crmSettings?.company_type,
    crmSettings?.companyType,
    company?.company_type,
    company?.type,
    company?.companyType,
    company?.tenant_type
  )
  const isGeneralTenant = tenantTypeNorm === 'general'
  const isRealEstateTenant = tenantTypeNorm === 'realestate'
  const allowAllTenantTypes = !tenantTypeNorm
  const numericLocale = isArabic ? 'ar-EG' : 'en-US'

  const filterInventoryPermsByTenantType = useCallback((list) => {
    const perms = Array.isArray(list) ? list : []
    if (allowAllTenantTypes) return perms
    const generalOnly = new Set(['addCategory', 'addItems', 'exportCategory', 'exportItem'])
    const realEstateOnly = new Set(['addProject', 'addProperties', 'addBroker', 'addDeveloper', 'revertSoldProperty', 'exportProject', 'exportProperties'])
    if (isGeneralTenant) return perms.filter(p => !realEstateOnly.has(p))
    if (isRealEstateTenant) return perms.filter(p => !generalOnly.has(p))
    return perms
  }, [allowAllTenantTypes, isGeneralTenant, isRealEstateTenant])

  const [form, setForm] = useState({
    fullName: (user?.fullName || user?.name || '').trim(),
    email: user?.email || '',
    phone: user?.phone || '',
    username: user?.username || '',
    password: '',
    birthDate: user?.birthDate || user?.birth_date || '',
    avatar: user?.avatar_url || '',
    sendInvite: !isEdit,
    role:
      user?.role ||
      (Array.isArray(user?.roles) && user.roles[0]?.name) ||
      user?.job_title ||
      '',
    agencyId: user?.agency_id || '',
    directManager: normalizeSelectValue(
      user?.directManager ??
      user?.manager_id ??
      user?.manager?.id ??
      ''
    ),
    status: user?.status || 'Active',
    department:
      user?.departmentId ||
      user?.department ||
      user?.department_id ||
      '',
    allowedCountries: Array.isArray(user?.allowed_countries) ? user.allowed_countries : [],
    allowedRegions: Array.isArray(user?.allowed_regions) ? user.allowed_regions : [],
    allowedSources: Array.isArray(user?.allowed_sources) ? user.allowed_sources : [],
    allowedProjects: Array.isArray(user?.allowed_projects) ? user.allowed_projects : [],
    branch: user?.branch || '',
    region: user?.region || '',
    area: user?.area || '',
    notifEmail:
      user?.notifEmail ??
      (typeof user?.notif_email !== 'undefined' ? user.notif_email : true),
    notifSms:
      user?.notifSms ??
      (typeof user?.notif_sms !== 'undefined' ? user.notif_sms : false),
    notifApp:
      user?.notifApp ??
      user?.notification_settings?.app ??
      true,
    monthlyTarget: user?.monthly_target || '',
    quarterlyTarget: user?.quarterly_target || '',
    yearlyTarget: user?.yearly_target || '',
    commissionPercentage: user?.commission_percentage || '',
  });
  const [customPerms, setCustomPerms] = useState({});
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'account' | 'notifications'
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialForm, setInitialForm] = useState({ ...form });
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [sources, setSources] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        api.get('/api/departments'),
        api.get('/api/users?all=1').catch(() => api.get('/api/users')),
        api.get('/api/countries'),
        api.get('/api/regions'),
        api.get('/api/sources'),
        api.get('/api/agencies?active=1'),
        api.get('/api/projects'),
      ]);

      const [
        departmentsResult,
        usersResult,
        countriesResult,
        regionsResult,
        sourcesResult,
        agenciesResult,
        projectsResult,
      ] = results;

      const getData = (result, fallback = []) => (
        result?.status === 'fulfilled' ? result.value?.data : fallback
      );

      const departmentsData = getData(departmentsResult, []);
      const usersData = getData(usersResult, []);
      const countriesData = getData(countriesResult, []);
      const regionsData = getData(regionsResult, []);
      const sourcesData = getData(sourcesResult, []);
      const agenciesData = getData(agenciesResult, []);
      const projectsData = getData(projectsResult, []);

      setDepartments(Array.isArray(departmentsData) ? departmentsData : (departmentsData?.data || []));
      const rawUsers = Array.isArray(usersData)
        ? usersData
        : (usersData?.data || []);
      const normalizedManagers = rawUsers.map(u => ({
        ...u,
        role: Array.isArray(u.roles) && u.roles[0]?.name ? u.roles[0].name : (u.role || u.job_title || ''),
      }));
      setManagers(normalizedManagers);
      setCountries(Array.isArray(countriesData) ? countriesData : (countriesData?.data || []));
      setRegions(Array.isArray(regionsData) ? regionsData : (regionsData?.data || []));
      setSources(Array.isArray(sourcesData) ? sourcesData : (sourcesData?.data || []));
      setAgencies(Array.isArray(agenciesData) ? agenciesData : (agenciesData?.data || []));
      setProjects(Array.isArray(projectsData) ? projectsData : (projectsData?.data || []));

      if (agenciesResult?.status === 'rejected') {
        console.error('Failed to fetch tenant agencies', agenciesResult.reason);
      }
    } catch (err) {
      console.error('Failed to fetch form data', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isCustomRole = useMemo(() => form.role === 'Custom', [form.role]);
  const isPrimaryAdmin = useMemo(
    () => !!(user?.is_primary_admin || user?.is_super_admin),
    [user]
  );

  const isManager = useMemo(() => {
    const r = String(form.role || '').toLowerCase()
    // If role is empty, assume not manager yet or default
    if (!r) return false
    // Sales roles are not managers in this context
    const isSales = r.includes('sales person') || r.includes('salesperson') || r.includes('agent') || r.includes('broker')
    return !isSales
  }, [form.role])

  const getTargetLabel = (periodAr, periodEn) => {
      if (isManager) {
          return isArabic 
            ? `تارجت ${periodAr} (إضافي/شخصي)` 
            : `Personal/Extra ${periodEn} Target`
      }
      return isArabic ? `تارجت ${periodAr}` : `${periodEn} Target`
  }
  const showModulePerms = useMemo(() => isCustomRole || form.role === 'Sales Admin', [isCustomRole, form.role])
  const showGeoFields = useMemo(() => ['Sales Admin','Operation Manager','Branch Manager','Director'].includes(form.role), [form.role])
  const showAssignmentScopeFilters = useMemo(() => {
    const hiddenRoles = new Set([
      'director',
      'operation manager',
      'operations manager',
      'sales admin',
      'customer manager',
      'customer team leader',
      'customer agent',
      'support manager',
      'support team leader',
      'support agent',
      'accountant',
    ]);

    return !hiddenRoles.has(normalizeRoleValue(form.role));
  }, [form.role])
  const countryOptions = useMemo(() => {
    const seen = new Set();
    return (countries || []).map(country => {
      const value = String(country?.name_en || country?.name || country?.name_ar || '').trim();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      return {
        value,
        label: isArabic ? (country?.name_ar || country?.name_en || country?.name || value) : (country?.name_en || country?.name || country?.name_ar || value),
      };
    }).filter(Boolean);
  }, [countries, isArabic]);
  const regionOptions = useMemo(() => {
    const seen = new Set();
    return (regions || []).map(regionItem => {
      const value = String(regionItem?.name_en || regionItem?.name || regionItem?.name_ar || '').trim();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      return {
        value,
        label: isArabic ? (regionItem?.name_ar || regionItem?.name_en || regionItem?.name || value) : (regionItem?.name_en || regionItem?.name || regionItem?.name_ar || value),
      };
    }).filter(Boolean);
  }, [regions, isArabic]);
  const sourceOptions = useMemo(() => {
    const seen = new Set();
    return (sources || []).map(source => {
      const value = String(source?.name || source?.title || source?.value || '').trim();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      return { value, label: value };
    }).filter(Boolean);
  }, [sources]);
  const projectOptions = useMemo(() => {
    const seen = new Set();
    return (projects || []).map(project => {
      const value = String(project?.name || project?.name_ar || '').trim();
      if (!value || seen.has(value)) return null;
      seen.add(value);
      return {
        value,
        label: isArabic ? (project?.name_ar || project?.name || value) : (project?.name || project?.name_ar || value),
      };
    }).filter(Boolean);
  }, [projects, isArabic]);
  const agencyOptions = useMemo(() => {
    const baseOptions = (agencies || []).map((agency) => {
      const value = String(agency?.key || '').trim();
      const label = String(agency?.name || agency?.key || '').trim();
      if (!value || !label) return null;
      return { value, label };
    }).filter(Boolean);

    const currentValue = String(form.agencyId || '').trim();
    if (!currentValue || baseOptions.some(option => option.value === currentValue)) {
      return baseOptions;
    }

    return [{ value: currentValue, label: currentValue }, ...baseOptions];
  }, [agencies, form.agencyId]);

  const passwordStrength = useMemo(() => {
    const pwd = form.password || '';
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[!@#$%^&*]/.test(pwd)) score += 1;
    return score; // 0-3
  }, [form.password]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm) || Object.keys(customPerms).length > 0;
  }, [form, initialForm, customPerms]);

  const reportPerms = customPerms['Reports'] || [];
  const allReportsShowSelected = REPORT_MODULES.every(module => reportPerms.includes(`${module}_show`));
  const allReportsExportSelected = REPORT_MODULES.every(module => reportPerms.includes(`${module}_export`));

  useEffect(() => {
    if (!isEdit || !user) return;

    const modulePerms = user?.meta_data?.module_permissions || user?.module_permissions || {};
    const role =
      user?.role ||
      (Array.isArray(user?.roles) && user.roles[0]?.name) ||
      user?.job_title ||
      '';

    if (isAdminRole(role) && (user?.is_primary_admin || Object.keys(modulePerms).length === 0)) {
      setCustomPerms(buildSelectAllPermissions(filterInventoryPermsByTenantType));
      return;
    }

    if (modulePerms && Object.keys(modulePerms).length > 0) {
      setCustomPerms(modulePerms);
    }
  }, [isEdit, user, filterInventoryPermsByTenantType]);

  useEffect(() => {
    const modulePerms = isEdit ? (user?.meta_data?.module_permissions || user?.module_permissions || {}) : {};
    if (Object.keys(modulePerms).length > 0) {
      // this user already has explicit module permissions, don't override them by role defaults.
      return;
    }

    if (form.role === 'Sales Admin') {
      setCustomPerms({
        Leads: ['addLead','importLeads','addAction'],
        Inventory: [],
        Marketing: ['showMarketingDashboard','showCampaign','addLandingPage'],
        Customers: ['convertFromLead', 'addCustomer', 'showModule'],
        Support: ['showModule'],
        Control: ['addRegions','addArea','addSource','userManagement','allowActionOnTeam','assignLeads','checkInOutApprovals','showReports','addDepartment']
      })
    } else if (form.role === 'Operation Manager') {
      setCustomPerms({
        Leads: ['addLead','importLeads','editInfo','editPhone','addAction'],
        Inventory: ['addCategory','addItems'],
        Marketing: [],
        Customers: ['editInfo','showModule'],
        Support: ['showModule','addTickets','sla','reports'],
        Control: ['allowActionOnTeam','checkInOutApprovals','showReports','addDepartment']
      })
    } else if (form.role === 'Branch Manager') {
      setCustomPerms({
        Leads: ['addLead','importLeads','editInfo','addAction'],
        Inventory: ['addCategory','addItems'],
        Customers: ['addCustomer','editInfo','showModule'],
        Support: ['showModule'],
        Control: ['allowActionOnTeam','assignLeads','checkInOutApprovals','showReports']
      })
    } else if (form.role === 'Director') {
      setCustomPerms({
        Leads: ['addLead','importLeads','editInfo','addAction'],
        Inventory: [],
        Marketing: ['showMarketingDashboard','showCampaign','addLandingPage','integration'],
        Customers: ['convertFromLead','addCustomer','editInfo','showModule'],
        Support: ['showModule'],
        Control: ['userManagement','assignLeads','checkInOutApprovals','exportLeads','showReports','multiAction','salesComment']
      })
    } else if (form.role === 'Sales Manager') {
      setCustomPerms({
        Leads: ['addLead','importLeads','editInfo','addAction'],
        Customers: ['convertFromLead','addCustomer','editInfo','showModule'],
        Control: ['assignLeads','checkInOutApprovals','showReports']
      })
    } else if (form.role === 'Team Leader') {
      setCustomPerms({
        Leads: ['addLead','importLeads','addAction'],
        Customers: ['editInfo','showModule'],
        Control: ['allowActionOnTeam','assignLeads','checkInOutApprovals','showReports']
      })
    } else if (form.role === 'Sales Person') {
      setCustomPerms({
        Leads: ['addLead','importLeads','addAction'],
        Customers: ['showModule'],
        Control: ['showReports']
      })
    } else if (form.role === 'Marketing Manager') {
      setCustomPerms({
        Marketing: ['showMarketingDashboard','showCampaign','addLandingPage','integration']
      })
    } else if (form.role === 'Marketing Moderator') {
      setCustomPerms({
        Marketing: ['showMarketingDashboard','showCampaign']
      })
    } else if (form.role === 'Customer Manager') {
      setCustomPerms({
        Customers: ['convertFromLead','addCustomer','editInfo','deleteCustomer','showModule'],
        Control: ['showReports']
      })
    } else if (form.role === 'Customer Team Leader') {
      setCustomPerms({
        Customers: ['editInfo','showModule']
      })
    } else if (form.role === 'Customer Agent') {
      setCustomPerms({
        Customers: ['showModule']
      })
    } else if (form.role === 'Support Manager') {
      setCustomPerms({
        Support: ['showModule','addTickets','sla','reports','exportReports','deleteTickets']
      })
    } else if (form.role === 'Support Team Leader') {
      setCustomPerms({
        Support: ['showModule','addTickets','sla','reports']
      })
    } else if (form.role === 'Support Agent') {
      setCustomPerms({
        Support: ['showModule','addTickets']
      })
    } else if (form.role === 'Custom') {
      setCustomPerms({})
    } else if (isAdminRole(form.role)) {
      setCustomPerms(buildSelectAllPermissions(filterInventoryPermsByTenantType))
    } else {
      setCustomPerms({})
    }
  }, [form.role, filterInventoryPermsByTenantType])

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!form.directManager || !managers.length) return
    const selected = managers.find(m => String(m.id) === String(form.directManager))
    if (!selected) return
    const managerRole = selected.role || selected.job_title || ''
    const normalizedManagerRole = normalizeRoleValue(managerRole)
    const isDirectorOrOps =
      normalizedManagerRole.includes('director') ||
      normalizedManagerRole.includes('operation manager') ||
      normalizedManagerRole.includes('operations manager')
    const isAdminOrTenantAdmin =
      normalizedManagerRole === 'admin' ||
      normalizedManagerRole === 'tenant admin' ||
      normalizedManagerRole === 'super admin'

    if (isDirectorOrOps || isAdminOrTenantAdmin) {
      updateField('directManager', '')
    }
  }, [form.directManager, managers])

  const calculateTargets = (value, type) => {
    const normalizedValue = normalizeNumericInput(value);
    const num = parseFloat(normalizedValue);
    
    if (isNaN(num)) {
       setForm(prev => ({ ...prev, monthlyTarget: normalizedValue, quarterlyTarget: '', yearlyTarget: '' })); // allow clearing
       if (normalizedValue === '') setForm(prev => ({ ...prev, monthlyTarget: '', quarterlyTarget: '', yearlyTarget: '' }));
       return;
    }

    if (type === 'monthly') {
      setForm(prev => ({ 
        ...prev,
        monthlyTarget: normalizedValue, 
        quarterlyTarget: String(num * 3), 
        yearlyTarget: String(num * 12) 
      }));
    } else if (type === 'quarterly') {
      setForm(prev => ({ 
        ...prev,
        monthlyTarget: String(num / 3), 
        quarterlyTarget: normalizedValue, 
        yearlyTarget: String(num * 4) 
      }));
    } else if (type === 'yearly') {
      setForm(prev => ({ 
        ...prev,
        monthlyTarget: String(num / 12), 
        quarterlyTarget: String(num / 4), 
        yearlyTarget: normalizedValue 
      }));
    }
  };

  const togglePerm = (group, perm) => {
    setCustomPerms((prev) => {
      const groupSet = new Set(prev[group] || []);
      if (groupSet.has(perm)) groupSet.delete(perm);
      else groupSet.add(perm);
      return { ...prev, [group]: Array.from(groupSet) };
    });
  };

  const toggleAllPerms = (group, perms, lockedPerms = []) => {
    setCustomPerms((prev) => {
      const currentPerms = prev[group] || [];
      const allSelected = perms.every(p => currentPerms.includes(p));
      const locked = Array.isArray(lockedPerms) ? lockedPerms : [];
      return {
        ...prev,
        [group]: allSelected ? [...locked] : Array.from(new Set([...perms, ...locked]))
      };
    });
  };

  // Auto-grant for Sales Person: Leads.addAction (hidden in UI).
  useEffect(() => {
    if (!isSalesPersonRole(form.role)) return;
    setCustomPerms((prev) => {
      const next = { ...(prev || {}) };
      const leads = Array.isArray(next.Leads) ? next.Leads : [];
      if (leads.includes('addAction')) return prev;
      next.Leads = [...leads, 'addAction'];
      return next;
    });
  }, [form.role]);

  const handleToggleAllReportsShow = () => {
    setCustomPerms(prev => {
      const current = prev.Reports || [];
      const showKeys = REPORT_MODULES.map(module => `${module}_show`);
      const exportKeys = REPORT_MODULES.map(module => `${module}_export`);
      const allSelected = showKeys.every(key => current.includes(key));
      const next = new Set(current);

      if (allSelected) {
        REPORT_MODULES.forEach(module => {
          const showKey = `${module}_show`;
          const exportKey = `${module}_export`;
          if (!next.has(exportKey)) {
            next.delete(showKey);
          }
        });
      } else {
        showKeys.forEach(key => next.add(key));
      }

      return { ...prev, Reports: Array.from(next) };
    });
  };

  const handleToggleAllReportsExport = () => {
    setCustomPerms(prev => {
      const current = prev.Reports || [];
      const showKeys = REPORT_MODULES.map(module => `${module}_show`);
      const exportKeys = REPORT_MODULES.map(module => `${module}_export`);
      const allSelected = exportKeys.every(key => current.includes(key));
      const next = new Set(current);
      if (allSelected) {
        exportKeys.forEach(key => next.delete(key));
      } else {
        showKeys.forEach(key => next.add(key));
        exportKeys.forEach(key => next.add(key));
      }
      return { ...prev, Reports: Array.from(next) };
    });
  };

  const handleToggleSingleReportExport = (module) => {
    setCustomPerms(prev => {
      const current = prev.Reports || [];
      const next = new Set(current);
      const exportKey = `${module}_export`;
      const showKey = `${module}_show`;

      if (next.has(exportKey)) {
        next.delete(exportKey);
      } else {
        next.add(exportKey);
        next.add(showKey);
      }

      return { ...prev, Reports: Array.from(next) };
    });
  };

  const toggleGroupExpand = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const validate = () => {
    const e = {};
    if (!form.fullName?.trim()) e.fullName = 'Full Name is required';
    if (!form.email?.trim()) e.email = 'Email is required';
    if (!form.role?.trim()) e.role = 'Role is required';
    if (['Marketing Manager', 'Marketing Moderator'].includes(form.role) && !String(form.agencyId || '').trim()) {
      e.agencyId = isArabic ? 'الوكالة مطلوبة لهذا الدور' : 'Agency is required for this role';
    }
    if (!isPrimaryAdmin && !isEdit && (form.password?.length || 0) < 8) e.password = 'Password must be at least 8 characters';
    if (!isPrimaryAdmin && isEdit && form.password && form.password.length < 8) e.password = 'Password must be at least 8 characters';
    
    if (form.phone && form.phone.trim()) {
      const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;
      const digits = form.phone.replace(/\D/g, '');
      if (!phoneRegex.test(form.phone) || digits.length < 8 || digits.length > 15) {
           e.phone = isArabic ? 'رقم الهاتف غير صحيح (يجب أن يكون بين 8 و 15 رقم)' : 'Invalid phone number (must be 8-15 digits)';
      }
    }

    setErrors(e);
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      const firstErrorKey = Object.keys(clientErrors)[0];
      const errorElement = document.querySelector(`[name="${firstErrorKey}"]`);
      if (errorElement) errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    
    setLoading(true);
    try {
      const formData = new FormData();

      formData.append('name', (form.fullName || '').trim());
      if (form.email) formData.append('email', String(form.email).trim());
      const passwordToSend = String(form.password || '').trim();
      if (!isPrimaryAdmin && passwordToSend && (!isEdit || passwordToSend)) {
        formData.append('password', passwordToSend);
      }
      const usernameChanged = form.username !== initialForm.username;
      if (!isEdit || usernameChanged) {
        formData.append('username', String(form.username || '').trim());
      }
      formData.append('phone', form.phone || '');
      formData.append('birth_date', form.birthDate || '');
      formData.append('status', form.status || '');
      formData.append('manager_id', form.directManager || '');
      formData.append('department_id', form.department || '');
      formData.append('role', form.role || '');
      formData.append('agency_id', String(form.agencyId || '').trim());
      formData.append('notif_email', form.notifEmail ? 1 : 0);
      formData.append('notif_sms', form.notifSms ? 1 : 0);
      formData.append('notification_settings', JSON.stringify({
        email: !!form.notifEmail,
        sms: !!form.notifSms,
        app: !!form.notifApp,
      }));
      formData.append('monthly_target', normalizeNumericInput(form.monthlyTarget) || '');
      formData.append('quarterly_target', normalizeNumericInput(form.quarterlyTarget) || '');
      formData.append('yearly_target', normalizeNumericInput(form.yearlyTarget) || '');
      formData.append('commission_percentage', normalizeNumericInput(form.commissionPercentage) || '');
      const allowedCountries = Array.isArray(form.allowedCountries) ? form.allowedCountries.filter(Boolean) : [];
      const allowedRegions = Array.isArray(form.allowedRegions) ? form.allowedRegions.filter(Boolean) : [];
      const allowedSources = Array.isArray(form.allowedSources) ? form.allowedSources.filter(Boolean) : [];
      const allowedProjects = Array.isArray(form.allowedProjects) ? form.allowedProjects.filter(Boolean) : [];
      (allowedCountries.length ? allowedCountries : ['']).forEach(value => formData.append('allowed_countries[]', value));
      (allowedRegions.length ? allowedRegions : ['']).forEach(value => formData.append('allowed_regions[]', value));
      (allowedSources.length ? allowedSources : ['']).forEach(value => formData.append('allowed_sources[]', value));
      (allowedProjects.length ? allowedProjects : ['']).forEach(value => formData.append('allowed_projects[]', value));

      // Auto-grant for Sales Person: Leads.addAction (not user-configurable in UI).
      if (isSalesPersonRole(form.role)) {
        formData.append('permissions[Leads][]', 'addAction');
      }

      Object.entries(customPerms || {}).forEach(([group, perms]) => {
        const baseAllowed = group === 'Reports' ? null : (PERMISSIONS[group] || []);
        const roleFilteredAllowed = baseAllowed ? getRoleFilteredPermissions(group, baseAllowed, form.role) : baseAllowed;
        const allowed = (group === 'Inventory' && roleFilteredAllowed)
          ? filterInventoryPermsByTenantType(roleFilteredAllowed)
          : roleFilteredAllowed;
        (perms || []).forEach((perm) => {
          if (allowed && !allowed.includes(perm)) return;
          if (isSalesPersonRole(form.role) && group === 'Leads' && perm === 'addAction') return;
          formData.append(`permissions[${group}][]`, perm);
        });
      });

      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      let response;
      if (isEdit) {
        formData.append('_method', 'PUT');
        response = await api.post(`/api/users/${user.id}`, formData);
      } else {
        response = await api.post('/api/users', formData);
      }

      if (onSuccess) {
        onSuccess(response.data);
      }

      // Dispatch toast
      const evt = new CustomEvent('app:toast', { 
        detail: { 
            type: 'success', 
            message: isEdit 
                ? (isArabic ? 'تم تحديث بيانات المستخدم بنجاح' : 'User updated successfully') 
                : (isArabic ? 'تم إضافة المستخدم بنجاح' : 'User created successfully') 
        } 
      });
      window.dispatchEvent(evt);
      if (onClose) onClose();
      else navigate('/user-management/users');
    } catch (error) {
      console.error('Failed to save user', error);
      const errorMsg = error.response?.data?.message || (isArabic ? 'فشل حفظ البيانات' : 'Failed to save data');
      const validationErrors = error.response?.data?.errors ? Object.values(error.response.data.errors).flat().join('\n') : '';

      // If backend returned Laravel validation errors (422), map them to our form fields and scroll to the first one.
      if (error.response?.status === 422 && error.response?.data?.errors) {
        const serverErrors = error.response.data.errors;
        const mapServerField = (key) => {
          switch (key) {
            case 'name': return 'fullName';
            case 'birth_date': return 'birthDate';
            case 'manager_id': return 'directManager';
            case 'department_id': return 'department';
            default: return key;
          }
        };

        const next = {};
        Object.entries(serverErrors).forEach(([k, msgs]) => {
          const mk = mapServerField(k);
          const arr = Array.isArray(msgs) ? msgs : [msgs];
          const first = arr.filter(Boolean)[0];
          if (first && !next[mk]) next[mk] = String(first);
        });

        if (Object.keys(next).length > 0) {
          setErrors(prev => ({ ...prev, ...next }));
          const firstErrorKey = Object.keys(next)[0];
          const errorElement = document.querySelector(`[name="${firstErrorKey}"]`);
          if (errorElement) errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      const evt = new CustomEvent('app:toast', { 
        detail: { 
            type: 'error', 
            message: validationErrors ? `${errorMsg}\n${validationErrors}` : errorMsg
        } 
      });
      window.dispatchEvent(evt);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = "input input-bordered w-full bg-[rgba(255,255,255,0.06)] border-base-content/10 focus:border-primary focus:bg-[rgba(255,255,255,0.1)] transition-all placeholder:text-base-content/30";

  return (
    <div className="card bg-base-100 shadow-xl w-full p-4 md:p-6 space-y-6 pb-5 h-full overflow-y-auto custom-scrollbar">
      
      {/* Header & Actions */}
      <div className="flex md:flex-row justify-between items-start md:items-center gap-4 border-b border-base-content/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <User size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isEdit 
                ? (isArabic ? 'تعديل بيانات المستخدم' : 'Edit User') 
                : (isArabic ? 'إضافة مستخدم جديد' : 'Add New User')
              }
            </h1>
            <p className="text-sm text-base-content/60 mt-1">
              {isEdit
                ? (isArabic ? 'تعديل تفاصيل المستخدم والصلاحيات' : 'Edit user details and permissions')
                : (isArabic ? 'أدخل تفاصيل المستخدم والبيانات الأساسية' : 'Enter user details and basic information')
              }
            </p>
          </div>
        </div>
 
      </div>

        <form onSubmit={onSubmit} className="space-y-6">
        <div className="w-full overflow-x-auto pb-2 mb-6">
          <div className="inline-flex p-1 bg-[rgba(255,255,255,0.04)] rounded-xl border border-white/5 min-w-full md:min-w-0">
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-all duration-200 ${activeTab==='info' ? 'bg-[rgba(59,130,246,0.25)] text-theme-text font-semibold shadow-sm' : 'text-theme-text font-normal hover:bg-[rgba(255,255,255,0.06)]'}`} 
              onClick={()=>setActiveTab('info')}
            >
              <Info size={18} />
              <span>{isArabic ? 'المعلومات' : 'Info'}</span>
            </button>
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-all duration-200 ${activeTab==='account' ? 'bg-[rgba(59,130,246,0.25)] text-theme-text font-semibold shadow-sm' : 'text-theme-text font-normal hover:bg-[rgba(255,255,255,0.06)]'}`} 
              onClick={()=>setActiveTab('account')}
            >
              <Settings size={18} />
              <span>{isArabic ? 'إعدادات الحساب' : 'Account Setting'}</span>
            </button>
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-all duration-200 ${activeTab==='notifications' ? 'bg-[rgba(59,130,246,0.25)] text-theme-text font-semibold shadow-sm' : 'text-theme-text font-normal hover:bg-[rgba(255,255,255,0.06)]'}`} 
              onClick={()=>setActiveTab('notifications')}
            >
              <Bell size={18} />
              <span>{isArabic ? 'الإشعارات' : 'Notifications'}</span>
            </button>
            <button 
              type="button" 
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-all duration-200 ${activeTab==='targets' ? 'bg-[rgba(59,130,246,0.25)] text-theme-text font-semibold shadow-sm' : 'text-theme-text font-normal hover:bg-[rgba(255,255,255,0.06)]'}`} 
              onClick={()=>setActiveTab('targets')}
            >
              <Target size={18} />
              <span>{isArabic ? 'التارجت' : 'Targets'}</span>
            </button>
          </div>
        </div>

          {activeTab==='info' && (
          <div className="space-y-6">
            
            {/* Section: Basic Info */}
            <div className="glass-panel rounded-xl p-6 border border-base-content/5 shadow-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-base-content/10 pb-4">
                <div className="w-1 h-6 bg-primary rounded-full"></div>
                <h2 className="card-title text-lg">{isArabic ? 'المعلومات الأساسية' : 'Basic Info'}</h2>
              </div>
              
              <div className="grid grid-cols-1 gap-5">
                
                {/* Row 1: Full Name */}
                <div>
                  <label className="label pt-0">
                    <span className="label-text font-medium text-base-content/80">
                      Full Name <span className="text-[#FF6B6B]">*</span>
                    </span>
                  </label>
                  <input
                    className={inputStyle}
                    value={form.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    placeholder="e.g. John Doe"
                  />
                  {errors.fullName && (
                    <div className="flex items-center gap-1 mt-1.5 text-[#FF6B6B] text-xs">
                      <AlertCircle size={12} /> {errors.fullName}
                    </div>
                  )}
                </div>

                {/* Row 2: Username & Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="label pt-0">
                      <span className="label-text font-medium text-base-content/80">
                        Username (Optional)
                      </span>
                    </label>
                    <input 
                        className={inputStyle} 
                        value={form.username} 
                        onChange={(e) => updateField('username', e.target.value)} 
                        placeholder="johndoe" 
                    />
                  </div>
                  <div>
                    <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Email <span className="text-[#FF6B6B]">*</span></span></label>
                    <input 
                        type="email" 
                        className={inputStyle} 
                        value={form.email} 
                        onChange={(e) => updateField('email', e.target.value)} 
                        placeholder="john@example.com" 
                    />
                    {errors.email && <div className="flex items-center gap-1 mt-1.5 text-[#FF6B6B] text-xs"><AlertCircle size={12}/> {errors.email}</div>}
                  </div>
                </div>

                {/* Row 3: Phone & Birth Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Phone (Optional)</span></label>
                    <input className={inputStyle} value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+1 234 567 890" />
                    {errors.phone && <div className="flex items-center gap-1 mt-1.5 text-[#FF6B6B] text-xs"><AlertCircle size={12}/> {errors.phone}</div>}
                  </div>
                  <div>
                    <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Birth Date (Optional)</span></label>
                    <div className="w-full relative">
                      <input 
                        type="date"
                        className={`${inputStyle} dark:[color-scheme:dark]`}
                        value={form.birthDate}
                        onChange={(e) => updateField('birthDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Section: Security */}
            <div className="glass-panel rounded-xl p-6 border border-base-content/5 shadow-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-base-content/10 pb-4">
                <div className="w-1 h-6 bg-secondary rounded-full"></div>
                <h2 className="card-title text-lg">{isArabic ? 'الأمان' : 'Security'}</h2>
              </div>
              
              {isPrimaryAdmin ? (
                <div className="text-sm text-base-content/70 bg-base-200/50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    {isArabic
                      ? 'لا يمكن تغيير كلمة مرور المسؤول الرئيسي من هنا. يمكنك تعديل الصلاحيات وباقي البيانات.'
                      : 'The primary admin password cannot be changed here. You can update permissions and other details.'}
                  </span>
                </div>
              ) : (
              <div className="max-w-md">
                <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Password {!isEdit && <span className="text-[#FF6B6B]">*</span>}</span></label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className={`${inputStyle} pr-10`} 
                    value={form.password} 
                    onChange={(e) => updateField('password', e.target.value)} 
                    placeholder="••••••••"
                  />
                  <button 
                    type="button" 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                
                {form.password && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-1 h-1 w-full bg-base-300 rounded-full overflow-hidden">
                      <div className={`h-full flex-1 transition-all duration-300 ${passwordStrength > 0 ? (passwordStrength === 1 ? 'bg-error' : passwordStrength === 2 ? 'bg-warning' : 'bg-success') : 'bg-transparent'}`} />
                      <div className={`h-full flex-1 transition-all duration-300 ${passwordStrength > 1 ? (passwordStrength === 2 ? 'bg-warning' : 'bg-success') : 'bg-transparent'}`} />
                      <div className={`h-full flex-1 transition-all duration-300 ${passwordStrength > 2 ? 'bg-success' : 'bg-transparent'}`} />
                    </div>
                    <div className="flex justify-between text-xs px-0.5 mt-1">
                      <span className={`transition-colors duration-300 ${passwordStrength === 1 ? 'text-error font-bold' : 'text-[#6b7280]'}`}>{isArabic ? 'ضعيف' : 'Weak'}</span>
                      <span className={`transition-colors duration-300 ${passwordStrength === 2 ? 'text-warning font-bold' : 'text-[#6b7280]'}`}>{isArabic ? 'متوسط' : 'Medium'}</span>
                      <span className={`transition-colors duration-300 ${passwordStrength >= 3 ? 'text-success font-bold' : 'text-[#6b7280]'}`}>{isArabic ? 'قوي' : 'Strong'}</span>
                    </div>
                  </div>
                )}
                
                <div className="mt-2 text-xs text-base-content/50 flex items-start gap-1.5 bg-base-200/50 p-2 rounded-lg">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>Minimum 8 characters, at least one number and one symbol recommended.</span>
                </div>

                {errors.password && <div className="flex items-center gap-1 mt-1.5 text-[#FF6B6B] text-xs"><AlertCircle size={12}/> {errors.password}</div>}
              </div>
              )}
            </div>

            {/* Section: Profile Photo */}
            <div className="glass-panel rounded-xl p-6 border border-base-content/5 shadow-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-base-content/10 pb-4">
                <div className="w-1 h-6 bg-accent rounded-full"></div>
                <h2 className="card-title text-lg">{isArabic ? 'الصورة الشخصية' : 'Profile Photo'}</h2>
              </div>

              <div className="flex items-start gap-6">
                 <div className={`w-24 h-24 rounded-2xl overflow-hidden border-2 ${form.avatar ? 'border-primary' : 'border-dashed border-base-content/20'} flex items-center justify-center bg-base-200/50 shrink-0 relative group`}>
                    {form.avatar ? (
                      <>
                        <img src={form.avatar} alt="Profile" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <button type="button" className="btn btn-circle btn-xs btn-error" onClick={() => updateField('avatar', '')}>
                             <X size={14} />
                           </button>
                        </div>
                      </>
                    ) : (
                      <User className="text-base-content/20" size={40} />
                    )}
                 </div>
                 
                 <div className="flex-1 max-w-sm">
                    <label className="flex flex-col gap-3 cursor-pointer group">
                       <div className="flex items-center gap-3">
                         <div className="btn btn-outline btn-sm gap-2 group-hover:btn-primary transition-all">
                           <Upload size={14} />
                           {isArabic ? 'اختر ملف' : 'Choose File'}
                         </div>
                         <span className="text-sm text-base-content/50 group-hover:text-base-content/80 transition-colors">
                           {isArabic ? 'أو اسحب وأفلت هنا' : 'or Drag & Drop here'}
                         </span>
                       </div>
                       <input type="file" accept="image/*" className="hidden" onChange={(e)=>{
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              const evt = new CustomEvent('app:toast', { detail: { type: 'error', message: 'File size must be less than 2MB' } });
                              window.dispatchEvent(evt);
                              return;
                            }
                            setAvatarFile(file);
                            const reader = new FileReader();
                            reader.onload = () => updateField('avatar', reader.result);
                            reader.readAsDataURL(file);
                          }} />
                    </label>
                    <p className="text-xs text-base-content/40 mt-3">
                      JPG, PNG, GIF • Max 2MB
                    </p>
                 </div>
              </div>
            </div>

          </div>
          )}

          {activeTab==='account' && (
          <div className="glass-panel rounded-xl p-4">
            <div>
              <div className="flex items-center gap-2 mb-6 border-b border-base-content/10 pb-4">
                <div className="w-1 h-6 bg-info rounded-full"></div>
                <h2 className="card-title text-lg">2. Account Settings</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
                <div className="md:order-1">
                  <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Role <span className="text-[#FF6B6B]">*</span></span></label>
                  <SearchableSelect
                    className="w-full"
                    options={ROLES}
                    value={form.role}
                    onChange={(val) => updateField('role', val)}
                    placeholder={isArabic ? 'اختر الدور' : 'Select role'}
                    showAllOption={false}
                  />
                  {errors.role && <div className="flex items-center gap-1 mt-1.5 text-[#FF6B6B] text-xs"><AlertCircle size={12}/> {errors.role}</div>}
                </div>
                {ROLE_HIERARCHY[form.role] && (
                  <div className="md:order-4">
                    <label className="label pt-0">
                      <span className="label-text font-medium text-base-content/80">
                        {isArabic ? 'المدير المباشر (اختياري)' : 'Direct Manager (Optional)'}
                      </span>
                    </label>
                    <SearchableSelect
                      className="w-full"
                      options={(() => {
                        const source = managers.filter(m => {
                          if (isEdit && m.id === user?.id) return false;
                          const managerRole = m.role || m.job_title || '';
                          const normalizedManagerRole = normalizeRoleValue(managerRole);
                          const isSales =
                            normalizedManagerRole.includes('sales person') ||
                            normalizedManagerRole.includes('salesperson') ||
                            normalizedManagerRole.includes('agent') ||
                            normalizedManagerRole.includes('broker');
                          const isDirectorOrOps =
                            normalizedManagerRole.includes('director') ||
                            normalizedManagerRole.includes('operation manager') ||
                            normalizedManagerRole.includes('operations manager')
                          const isAdminOrTenantAdmin =
                            normalizedManagerRole === 'admin' ||
                            normalizedManagerRole === 'tenant admin' ||
                            normalizedManagerRole === 'super admin'
                          return !isSales && !isDirectorOrOps && !isAdminOrTenantAdmin;
                        });

                        // Ensure the currently selected manager is present in options so we never display the raw ID.
                        const selectedId = String(form.directManager || '').trim();
                        if (selectedId) {
                          const selected = managers.find(m => String(m.id) === selectedId);
                          const alreadyIncluded = source.some(m => String(m.id) === selectedId);
                          if (selected && !alreadyIncluded && !(isEdit && String(selected.id) === String(user?.id))) {
                            source.unshift(selected);
                          }
                        }

                        return source.map(m => ({
                          value: String(m.id),
                          label: `${m.full_name || m.name} (${m.role || m.job_title || ''})`,
                        }));
                      })()}
                      value={normalizeSelectValue(form.directManager)}
                      onChange={(val) => updateField('directManager', normalizeSelectValue(val))}
                      placeholder={isArabic ? 'اختر المدير' : 'Select Manager'}
                    />
                  </div>
                )}
                <div className="md:order-2">
                  <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Status <span className="text-[#FF6B6B]">*</span></span></label>
                  <SearchableSelect
                    className="w-full"
                    options={STATUSES}
                    value={form.status}
                    onChange={(val) => updateField('status', val)}
                    placeholder={isArabic ? 'نشط' : 'Active'}
                  />
                </div>
                {['Marketing Manager', 'Marketing Moderator'].includes(form.role) && (
                  <div className="md:order-5">
                    <label className="label pt-0">
                      <span className="label-text font-medium text-base-content/80">
                        {isArabic ? 'الوكالة' : 'Agency'} <span className="text-[#FF6B6B]">*</span>
                      </span>
                    </label>
                    <SearchableSelect
                      className="w-full"
                      options={agencyOptions}
                      value={form.agencyId}
                      onChange={(value) => updateField('agencyId', normalizeSelectValue(value))}
                      placeholder={isArabic ? 'اختر الوكالة' : 'Select agency'}
                      showAllOption={false}
                    />
                    {errors.agencyId && <div className="flex items-center gap-1 mt-1.5 text-[#FF6B6B] text-xs"><AlertCircle size={12}/> {errors.agencyId}</div>}
                    <div className="text-xs text-base-content/50 mt-1.5">
                      {isArabic ? 'يتم حفظ المفتاح الثابت للوكالة داخليًا لاستخدامه في الفلترة والعزل.' : 'The agency stable key is stored internally for filtering and scoping.'}
                    </div>
                  </div>
                )}
                <div className="md:order-3">
                  <label className="label pt-0"><span className="label-text font-medium text-base-content/80">Department (Optional)</span></label>
                  <SearchableSelect
                    className="w-full"
                    options={departments.map(d => ({ value: d.id, label: d.name }))}
                    value={form.department}
                    onChange={(dept) => {
                      setForm(prev => ({ ...prev, department: dept }))
                    }}
                    placeholder={isArabic ? 'الكل' : 'All'}
                  />
                </div>
                {false && showAssignmentScopeFilters && (
                <div>
                  <label className="label pt-0">
                    <span className="label-text font-medium text-base-content/80">
                      {isArabic ? 'Ø§Ù„Ù…Ø´Ø§Ø±ÙŠØ¹ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)' : 'Projects (Optional)'}
                    </span>
                  </label>
                  <SearchableSelect
                    className="w-full"
                    options={projectOptions}
                    value={form.allowedProjects}
                    onChange={(vals) => updateField('allowedProjects', vals)}
                    placeholder={isArabic ? 'Ø§Ø®ØªØ± Ø§Ù„Ù…Ø´Ø§Ø±ÙŠØ¹' : 'Select projects'}
                    multiple
                  />
                </div>
                )}
              </div>
              {showAssignmentScopeFilters && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
                <div>
                  <label className="label pt-0">
                    <span className="label-text font-medium text-base-content/80">
                      {isArabic ? 'الدول (اختياري)' : 'Country (Optional)'}
                    </span>
                  </label>
                  <SearchableSelect
                    className="w-full"
                    options={countryOptions}
                    value={form.allowedCountries}
                    onChange={(vals) => updateField('allowedCountries', vals)}
                    placeholder={isArabic ? 'اختر الدول' : 'Select countries'}
                    multiple
                  />
                </div>
                <div>
                  <label className="label pt-0">
                    <span className="label-text font-medium text-base-content/80">
                      {isArabic ? 'المناطق (اختياري)' : 'Regions (Optional)'}
                    </span>
                  </label>
                  <SearchableSelect
                    className="w-full"
                    options={regionOptions}
                    value={form.allowedRegions}
                    onChange={(vals) => updateField('allowedRegions', vals)}
                    placeholder={isArabic ? 'اختر المناطق' : 'Select regions'}
                    multiple
                  />
                </div>
                <div>
                  <label className="label pt-0">
                    <span className="label-text font-medium text-base-content/80">
                      {isArabic ? 'المصادر (اختياري)' : 'Sources (Optional)'}
                    </span>
                  </label>
                  <SearchableSelect
                    className="w-full"
                    options={sourceOptions}
                    value={form.allowedSources}
                    onChange={(vals) => updateField('allowedSources', vals)}
                    placeholder={isArabic ? 'اختر المصادر' : 'Select sources'}
                    multiple
                  />
                </div>
                <div>
                  <label className="label pt-0">
                    <span className="label-text font-medium text-base-content/80">
                      {isArabic ? 'Projects (Optional)' : 'Projects (Optional)'}
                    </span>
                  </label>
                  <SearchableSelect
                    className="w-full"
                    options={projectOptions}
                    value={form.allowedProjects}
                    onChange={(vals) => updateField('allowedProjects', vals)}
                    placeholder={isArabic ? 'Select projects' : 'Select projects'}
                    multiple
                  />
                </div>
              </div>
              )}
              {showGeoFields && (
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <div>
                    <label className="label pt-0"><span className="label-text font-medium text-base-content/80">{isArabic ? 'الفرع (اختياري)' : 'Branch (Optional)'}</span></label>
                    <input className={inputStyle} value={form.branch} onChange={(e)=>updateField('branch', e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {activeTab==='account' && (
            <div className="glass-panel rounded-xl p-4">
              <div>
                <div className="flex items-center gap-2 mb-6 border-b border-base-content/10 pb-4">
                  <div className="w-1 h-6 bg-warning rounded-full"></div>
                  <h2 className="card-title text-lg">3. Permissions</h2>
                </div>
                <div className="flex flex-col gap-4 mt-3">
                  {Object.entries(PERMISSIONS)
                    .filter(([group]) => {
                      if (form.role === 'Team Leader') {
                        return !['Marketing'].includes(group);
                      }
                      if (['Marketing Manager', 'Marketing Moderator'].includes(form.role)) {
                        return !['Customers', 'Support'].includes(group);
                      }
                      if (['Customer Manager', 'Customer Team Leader', 'Customer Agent'].includes(form.role)) {
                        return ['Customers', 'Inventory'].includes(group);
                      }
                      if (form.role === 'Sales Person') {
                        return !['Marketing', 'Control', 'ContractCollections'].includes(group);
                      }
                      if (['Support Manager', 'Support Team Leader', 'Support Agent'].includes(form.role)) {
                        return ['Customers', 'Support'].includes(group);
                      }
                      return true;
                    })
                    .map(([group, perms]) => {
                    const groupPerms = customPerms[group] || [];
                    const lockedPerms = (isSalesPersonRole(form.role) && group === 'Leads') ? ['addAction'] : [];
                    const baseUiPerms = (isSalesPersonRole(form.role) && group === 'Leads')
                      ? perms.filter(p => p !== 'addAction')
                      : perms;
                    const uiPerms = getRoleFilteredPermissions(group, baseUiPerms, form.role);
                    const tenantUiPerms = group === 'Inventory' ? filterInventoryPermsByTenantType(uiPerms) : uiPerms;
                    const visibleGroupPerms = group === 'Reports' ? groupPerms : groupPerms.filter(p => tenantUiPerms.includes(p));
                    const allSelected = tenantUiPerms.length > 0 && tenantUiPerms.every(p => visibleGroupPerms.includes(p));
                    const isExpanded = expandedGroups[group];

                    return (
                    <div key={group} className="glass-panel rounded-lg overflow-hidden border border-base-content/5 bg-base-200/20">
                      <div 
                        className="p-3 flex items-center justify-between cursor-pointer hover:bg-base-content/5 transition-colors select-none"
                        onClick={() => toggleGroupExpand(group)}
                      >
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-base-content/50">
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                          <h3 className="font-medium">{isArabic ? (PERM_LABELS_AR.groups[group] || group) : group}</h3>
                          <span className="text-xs bg-base-content/10 px-2 py-0.5 rounded-full text-base-content/60">
                            {visibleGroupPerms.length} / {tenantUiPerms.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                           <label className="cursor-pointer flex items-center gap-2 select-none hover:bg-base-content/5 px-2 py-1 rounded transition-colors text-xs text-base-content/60">
                              <input 
                                type="checkbox" 
                                className="checkbox checkbox-xs checkbox-primary" 
                                checked={allSelected} 
                                onChange={() => toggleAllPerms(group, tenantUiPerms, lockedPerms)} 
                              />
                              <span>{isArabic ? 'تحديد الكل' : 'Select All'}</span>
                            </label>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="p-2 sm:p-3 pt-0 border-t border-base-content/5 bg-base-200/10">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 pt-3 sm:pt-4">
                            {tenantUiPerms.map((p) => {
                              const checked = visibleGroupPerms.includes(p);
                              return (
                                <label key={p} className="cursor-pointer flex items-center gap-2 sm:gap-3 select-none hover:bg-base-content/5 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-base-content/5 bg-base-100/50">
                                  <input type="checkbox" className="checkbox checkbox-xs sm:checkbox-sm checkbox-primary" checked={checked} onChange={() => togglePerm(group, p)} />
                                  <span className="text-xs sm:text-sm">{isArabic ? (PERM_LABELS_AR.actions[p] || p) : formatPermissionLabel(p)}</span>
                                </label>
                              );
                            })}
                          </div>
                          {isSalesPersonRole(form.role) && group === 'Leads' && (
                            <div className="mt-3 text-xs text-base-content/60">
                              {isArabic ? 'صلاحية إضافة إجراء يتم تفعيلها تلقائياً لمندوب المبيعات.' : 'Add Action is enabled automatically for Sales Person.'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )})}

                  {/* Reports Section */}
                  <div className="glass-panel rounded-lg overflow-hidden border border-base-content/5 bg-base-200/20">
                    <div 
                        className="p-3 flex items-center justify-between cursor-pointer hover:bg-base-content/5 transition-colors select-none"
                        onClick={() => toggleGroupExpand('Reports')}
                      >
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-base-content/50">
                            {expandedGroups['Reports'] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                          <h3 className="font-medium">{isArabic ? 'التقارير' : 'Reports'}</h3>
                        </div>
                    </div>
                    
                    {expandedGroups['Reports'] && (
                    <div className="p-0 border-t border-base-content/5">
                      <div className="overflow-x-auto">
                        <table className="table table-sm w-full">
                          <thead>
                            <tr className="bg-base-content/5">
                              <th className="bg-transparent border-b border-base-content/10 py-3">
                                {isArabic ? 'التقرير' : 'Report'}
                              </th>
                              <th className="text-center bg-transparent border-b border-base-content/10 w-32">
                                <div className="flex flex-col items-center gap-1 py-1">
                                  <span>{isArabic ? 'عرض' : 'Show'}</span>
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-primary"
                                    checked={allReportsShowSelected}
                                    onChange={handleToggleAllReportsShow}
                                  />
                                </div>
                              </th>
                              <th className="text-center bg-transparent border-b border-base-content/10 w-32">
                                <div className="flex flex-col items-center gap-1 py-1">
                                  <span>{isArabic ? 'تصدير' : 'Export'}</span>
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-xs checkbox-primary"
                                    checked={allReportsExportSelected}
                                    onChange={handleToggleAllReportsExport}
                                  />
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {REPORT_MODULES.map((module, idx) => (
                              <tr key={module} className={`border-b border-base-content/5 transition-colors ${idx % 2 === 0 ? 'bg-base-200/30' : 'bg-transparent'} hover:bg-base-content/5`}>
                                <td className="font-medium py-3 px-4">{isArabic ? (PERM_LABELS_AR.report_modules[module] || module) : module}</td>
                                <td className="text-center">
                                  <input 
                                    type="checkbox" 
                                    className="checkbox checkbox-sm checkbox-primary"
                                    checked={(customPerms['Reports'] || []).includes(`${module}_show`)}
                                    onChange={() => {
                                      const current = customPerms['Reports'] || [];
                                      const exportKey = `${module}_export`;
                                      const showKey = `${module}_show`;
                                      if (current.includes(exportKey)) {
                                        if (!current.includes(showKey)) {
                                          togglePerm('Reports', showKey);
                                        }
                                      } else {
                                        togglePerm('Reports', showKey);
                                      }
                                    }}
                                  />
                                </td>
                                <td className="text-center">
                                  <input 
                                    type="checkbox" 
                                    className="checkbox checkbox-sm checkbox-primary"
                                    checked={(customPerms['Reports'] || []).includes(`${module}_export`)}
                                    onChange={() => handleToggleSingleReportExport(module)}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab==='notifications' && (
            <div className="glass-panel rounded-xl p-4">
              <div>
                <div className="flex items-center gap-2 mb-6 border-b border-base-content/10 pb-4">
                  <div className="w-1 h-6 bg-secondary rounded-full"></div>
                  <h2 className="card-title text-lg">3. Notifications</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-4">
                      <input type="checkbox" className="toggle toggle-primary" checked={form.notifEmail} onChange={(e)=>updateField('notifEmail', e.target.checked)} />
                      <span className="label-text font-medium">Email Notifications</span>
                    </label>
                  </div>
                  <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-4">
                      <input type="checkbox" className="toggle toggle-primary" checked={form.notifSms} onChange={(e)=>updateField('notifSms', e.target.checked)} />
                      <span className="label-text font-medium">SMS Notifications</span>
                    </label>
                  </div>
                  <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-4">
                      <input type="checkbox" className="toggle toggle-primary" checked={form.notifApp} onChange={(e)=>updateField('notifApp', e.target.checked)} />
                      <span className="label-text font-medium">{t('App Notifications')}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab==='targets' && (
            <div className="glass-panel rounded-xl p-6 border border-base-content/5 shadow-sm animate-fade-in">
              <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 rounded-r-xl mb-8">
                <div className="flex items-start gap-3">
                  <Info className="text-blue-400 mt-0.5" size={20} />
                  <div>
                     <p className="text-sm text-blue-400 font-bold mb-1">
                       {isArabic ? 'نصيحة ذكية:' : 'Smart Tip:'}
                     </p>
                     <p className="text-sm text-blue-400/90">
                       {isArabic ? 'أدخل قيمة واحدة وسنقوم بحساب التوزيع التلقائي لبقية الفترات.' : 'Enter one value and we will automatically calculate the distribution for the rest of the periods.'}
                     </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
                 <div className="absolute top-1/2 left-0 w-full h-0.5 bg-base-content/10 -z-10 hidden md:block"></div>
                 
                 {/* Monthly Target */}
                 <div className="group">
                   <div className="glass-panel p-5 rounded-xl border border-base-content/5 bg-base-200/20 hover:bg-base-200/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                     <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                       <Clock size={40} className="text-primary" />
                     </div>
                     
                     <label className="label pt-0 justify-start gap-2 mb-2">
                       <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                         <Clock size={16} />
                       </div>
                       <span className="label-text font-medium text-base-content/80">
                         {getTargetLabel('شهري', 'Monthly')}
                       </span>
                     </label>
                     
                     <div className="relative mt-2">
                      <input 
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
                        value={formatNumericDisplay(form.monthlyTarget, numericLocale)} 
                        onChange={(e) => calculateTargets(e.target.value, 'monthly')} 
                        className="input input-bordered w-full bg-base-100/50 focus:bg-base-100 transition-all font-mono text-lg pr-12" 
                        placeholder="0.00" 
                      />
                       <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-base-content/30 text-xs font-mono">
                        {currencySymbol}
                      </div>
                    </div>
                    
                    <div className="mt-3 text-xs text-base-content/40 flex justify-between pt-3 border-t border-base-content/5">
                      <span>Base Value</span>
                      <span className="font-mono">1x</span>
                    </div>
                  </div>
                </div>

                {/* Quarterly Target */}
                <div className="group">
                  <div className="glass-panel p-5 rounded-xl border border-base-content/5 bg-base-200/20 hover:bg-base-200/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Calendar size={40} className="text-secondary" />
                    </div>
                    
                    <label className="label pt-0 justify-start gap-2 mb-2">
                      <div className="p-1.5 bg-secondary/10 rounded-lg text-secondary">
                        <Calendar size={16} />
                      </div>
                      <span className="label-text font-medium text-base-content/80">
                        {getTargetLabel('ربع سنوي', 'Quarterly')}
                      </span>
                    </label>
                    
                    <div className="relative mt-2">
                      <input 
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
                        value={formatNumericDisplay(form.quarterlyTarget, numericLocale)} 
                        onChange={(e) => calculateTargets(e.target.value, 'quarterly')} 
                        className="input input-bordered w-full bg-base-100/50 focus:bg-base-100 transition-all font-mono text-lg pr-12" 
                        placeholder="0.00" 
                      />
                       <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-base-content/30 text-xs font-mono">
                        {currencySymbol}
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-base-content/40 flex justify-between pt-3 border-t border-base-content/5">
                      <span>Accumulated</span>
                      <span className="font-mono">3 Months</span>
                    </div>
                  </div>
                </div>

                {/* Yearly Target */}
                <div className="group">
                  <div className="glass-panel p-5 rounded-xl border border-base-content/5 bg-base-200/20 hover:bg-base-200/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                      <TrendingUp size={40} className="text-accent" />
                    </div>
                    
                    <label className="label pt-0 justify-start gap-2 mb-2">
                      <div className="p-1.5 bg-accent/10 rounded-lg text-accent">
                        <TrendingUp size={16} />
                      </div>
                      <span className="label-text font-medium text-base-content/80">
                        {getTargetLabel('سنوي', 'Yearly')}
                      </span>
                    </label>
                    
                    <div className="relative mt-2">
                      <input 
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
                        value={formatNumericDisplay(form.yearlyTarget, numericLocale)} 
                        onChange={(e) => calculateTargets(e.target.value, 'yearly')} 
                        className="input input-bordered w-full bg-base-100/50 focus:bg-base-100 transition-all font-mono text-lg pr-12" 
                        placeholder="0.00" 
                      />
                       <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-base-content/30 text-xs font-mono">
                        {currencySymbol}
                      </div>
                     </div>

                     <div className="mt-3 text-xs text-base-content/40 flex justify-between pt-3 border-t border-base-content/5">
                       <span>Total Goal</span>
                       <span className="font-mono">12 Months</span>
                     </div>
                   </div>
                 </div>

                 {/* Commission Percentage */}
                 <div className="group">
                   <div className="glass-panel p-5 rounded-xl border border-base-content/5 bg-base-200/20 hover:bg-base-200/40 transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between">
                     <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                       <Percent size={40} className="text-warning" />
                     </div>
                     
                     <label className="label pt-0 justify-start gap-2 mb-2">
                       <div className="p-1.5 bg-warning/10 rounded-lg text-warning">
                         <Percent size={16} />
                       </div>
                       <span className="label-text font-medium text-base-content/80">
                         {isArabic ? 'نسبة العمولة' : 'Commission %'}
                       </span>
                     </label>
                     
                     <div className="relative mt-2">
                      <input 
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
                        value={formatNumericDisplay(form.commissionPercentage, numericLocale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} 
                        onChange={(e) => updateField('commissionPercentage', normalizeNumericInput(e.target.value))} 
                        className="input input-bordered w-full bg-base-100/50 focus:bg-base-100 transition-all font-mono text-lg pr-12" 
                        placeholder="0.00"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-base-content/30 text-xs font-mono">
                         %
                       </div>
                      </div>

                      <div className="mt-3 text-xs text-base-content/40 flex justify-between pt-3 border-t border-base-content/5">
                        <span>Per Deal</span>
                        <span className="font-mono">Rate</span>
                      </div>
                    </div>
                  </div>

              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t border-base-content/10">
            <button type="button" className="btn btn-ghost hover:bg-base-content/10" onClick={() => onClose ? onClose() : navigate('/user-management/users')}>{isArabic ? 'إلغاء' : 'Cancel'}</button>
            <button 
              type="submit" 
              className="btn btn-primary px-8"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (isArabic ? 'حفظ التغييرات' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
  );
}
