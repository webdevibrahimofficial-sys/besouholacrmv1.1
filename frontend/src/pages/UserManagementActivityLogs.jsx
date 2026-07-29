import { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@shared/context/ThemeProvider';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { createPortal } from 'react-dom';
import { FaFileExport } from 'react-icons/fa';
import {
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { api, logExportEvent } from '../utils/api';
import SearchableSelect from '../components/SearchableSelect';
import 'react-loading-skeleton/dist/skeleton.css';

const actionTypes = ['Created', 'Updated', 'Deleted', 'Login', 'Failed Login', 'Permission Change'];
const modules = ['Tickets', 'Customers', 'SLA', 'Reports', 'User Management', 'Settings', 'Integrations', 'Custom Modules'];

const typeToneMap = {
  Created: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Updated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Deleted: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  Login: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Failed Login': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Permission Change': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

export default function UserManagementActivityLogs() {
  const { theme: contextTheme, resolvedTheme } = useTheme();
  const theme = resolvedTheme || contextTheme;
  const isDark = theme === 'dark';
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({
    type: [],
    module: [],
    dateFrom: '',
    dateTo: '',
    datePeriod: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState('ts');
  const [sortOrder, setSortOrder] = useState('desc');

  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`;
  const inputClass = `h-10 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-900/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/80 text-slate-700 placeholder:text-slate-400'
  }`;
  const labelClass = isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-900';
  const headingClass = isDark ? 'text-white' : 'text-slate-950';
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const filterIconClass = isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600';
  const shellClass = isDark
    ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
    : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]';

  useEffect(() => {
    let mounted = true;

    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/user-management/activity-logs');
        if (!mounted) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setLogs(data);
      } catch (err) {
        console.error('Failed to load activity logs', err);
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: {
            type: 'error',
            message: isArabic ? 'فشل تحميل سجل الأنشطة' : 'Failed to load activity logs',
          },
        }));
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchLogs();

    return () => {
      mounted = false;
    };
  }, [isArabic]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (q) {
        const query = q.toLowerCase();
        const matchesSearch = [l.description, l.target, l.user, l.ip]
          .join(' ')
          .toLowerCase()
          .includes(query);
        if (!matchesSearch) return false;
      }

      if (filters.type.length > 0 && !filters.type.includes(l.type)) return false;
      if (filters.module.length > 0 && !filters.module.includes(l.module)) return false;
      if (filters.dateFrom && (l.ts || '') < filters.dateFrom) return false;
      if (filters.dateTo && (l.ts || '') > filters.dateTo) return false;

      return true;
    });
  }, [logs, q, filters]);

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortOrder('asc');
  };

  const sortedAndPaginated = useMemo(() => {
    const result = [...filtered];

    if (sortBy) {
      result.sort((a, b) => {
        let valA = a[sortBy] || '';
        let valB = b[sortBy] || '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    return result.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, sortBy, sortOrder, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const activeFilterCount = filters.type.length + filters.module.length + Number(Boolean(filters.dateFrom || filters.dateTo || q));

  const statCards = [
    {
      key: 'total',
      label: isArabic ? 'إجمالي السجلات' : 'Total Logs',
      value: logs.length,
      tone: isDark
        ? 'from-blue-500/16 via-blue-500/6 to-transparent border-blue-500/18'
        : 'from-blue-100/90 via-blue-50/80 to-white border-blue-200/70',
      iconTone: isDark ? 'bg-blue-500/14 text-blue-300 border-blue-400/20' : 'bg-blue-100 text-blue-700 border-blue-200/80',
    },
    {
      key: 'filtered',
      label: isArabic ? 'بعد التصفية' : 'Filtered Results',
      value: filtered.length,
      tone: isDark
        ? 'from-emerald-500/16 via-emerald-500/6 to-transparent border-emerald-500/18'
        : 'from-emerald-100/90 via-emerald-50/80 to-white border-emerald-200/70',
      iconTone: isDark ? 'bg-emerald-500/14 text-emerald-300 border-emerald-400/20' : 'bg-emerald-100 text-emerald-700 border-emerald-200/80',
    },
    {
      key: 'types',
      label: isArabic ? 'أنواع النشاط' : 'Action Types',
      value: new Set(filtered.map((item) => item.type).filter(Boolean)).size,
      tone: isDark
        ? 'from-violet-500/16 via-violet-500/6 to-transparent border-violet-500/18'
        : 'from-violet-100/90 via-violet-50/80 to-white border-violet-200/70',
      iconTone: isDark ? 'bg-violet-500/14 text-violet-300 border-violet-400/20' : 'bg-violet-100 text-violet-700 border-violet-200/80',
    },
    {
      key: 'filters',
      label: isArabic ? 'الفلاتر النشطة' : 'Active Filters',
      value: activeFilterCount,
      tone: isDark
        ? 'from-amber-500/16 via-amber-500/6 to-transparent border-amber-500/18'
        : 'from-amber-100/90 via-amber-50/80 to-white border-amber-200/70',
      iconTone: isDark ? 'bg-amber-500/14 text-amber-300 border-amber-400/20' : 'bg-amber-100 text-amber-700 border-amber-200/80',
    },
  ];

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const clearFilters = () => {
    setQ('');
    setCurrentPage(1);
    setFilters({
      type: [],
      module: [],
      dateFrom: '',
      dateTo: '',
      datePeriod: '',
    });
  };

  const handleDatePeriodChange = (period) => {
    const now = new Date();
    let from = '';
    let to = '';

    if (period === 'today') {
      from = now.toISOString().split('T')[0];
      to = now.toISOString().split('T')[0];
    } else if (period === 'week') {
      const first = new Date(now);
      first.setDate(now.getDate() - now.getDay());
      const last = new Date(first);
      last.setDate(first.getDate() + 6);
      from = first.toISOString().split('T')[0];
      to = last.toISOString().split('T')[0];
    } else if (period === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      from = first.toISOString().split('T')[0];
      to = last.toISOString().split('T')[0];
    }

    setCurrentPage(1);
    setFilters((prev) => ({
      ...prev,
      datePeriod: period,
      dateFrom: from,
      dateTo: to,
    }));
  };

  const exportToExcel = () => {
    const rows = filtered.map((l) => ({
      'Action Type': l.type,
      'Performed By': l.user,
      Target: l.target,
      Description: l.description,
      Timestamp: l.ts,
      'IP Address': l.ip,
      Module: l.module,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Logs');
    const fileName = 'activity-logs.xlsx';
    XLSX.writeFile(workbook, fileName);
    logExportEvent({
      module: 'User Management Activity Logs',
      fileName,
      format: 'xlsx',
    });
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/api/user-management/activity-logs');
      const data = Array.isArray(res.data) ? res.data : [];
      setLogs(data);
    } catch (err) {
      console.error('Failed to refresh activity logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`relative mx-auto max-w-screen-2xl overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${shellClass}`}>
      {isDark ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_28%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%)]" />
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.75),transparent_28%)]" />
          <div className="pointer-events-none absolute -top-24 right-12 h-56 w-56 rounded-full bg-blue-400/12 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-10 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        </>
      )}

      <div className="relative z-10">
        <header className="mb-10">
          <div className="flex gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <p className={`mb-2 text-xs uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {isArabic ? 'لوحة الإدارة' : 'Admin Panel'}
              </p>
              <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {isArabic ? 'سجل الأنشطة' : 'Activity Logs'}
              </h1>
              <p className={`mt-3 max-w-2xl text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {isArabic
                  ? 'راجع أنشطة المستخدمين وتغييرات الصلاحيات والحركات المهمة من واجهة بنفس هوية الأدمن بانل.'
                  : 'Review user actions, permission changes, and key system activity in the same admin panel visual language.'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
                  isDark
                    ? 'border-slate-700/60 bg-slate-900/80 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-200/80 bg-white/78 text-slate-600 hover:bg-white'
                }`}
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                {isArabic ? 'تحديث' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={exportToExcel}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700"
              >
                <FaFileExport />
                {isArabic ? 'تصدير Excel' : 'Export Excel'}
              </button>
            </div>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.key} className={`${glassCard} relative overflow-hidden border bg-gradient-to-br px-4 py-3 ${card.tone}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs uppercase tracking-[0.22em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {card.label}
                  </p>
                  <p className={`mt-3 break-words text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    {card.value}
                  </p>
                </div>
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${card.iconTone}`}>
                  <ShieldCheck size={19} />
                </span>
              </div>
            </div>
          ))}
        </section>

        <section className={`${glassCard} mb-5 p-5 md:p-6`}>
          <div className="mb-5 flex gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${filterIconClass}`}>
                <Filter size={20} />
              </span>
              <div>
                <h2 className={`text-xl font-bold ${headingClass}`}>{isArabic ? 'الفلاتر' : 'Filters'}</h2>
                <p className={`mt-1 text-xs ${mutedTextClass}`}>
                  {isArabic ? 'طبّق البحث والتصفية بسرعة بنفس تنسيق الأدمن بانل.' : 'Apply search and filtering with the admin panel style.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className={`rounded-2xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isArabic ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <label className={`flex items-center gap-2 ${labelClass}`}>
                <Search className="h-4 w-4 text-blue-500" />
                {isArabic ? 'بحث' : 'Search'}
              </label>
              <div className="relative">
                <Search className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 ${isArabic ? 'right-4' : 'left-4'} text-slate-400`} />
                <input
                  className={`${inputClass} ${isArabic ? 'pr-10' : 'pl-10'}`}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={isArabic ? 'بحث في الوصف أو الهدف أو المستخدم...' : 'Search description, target, or user...'}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={`block ${labelClass}`}>{isArabic ? 'الموديول' : 'Module'}</label>
              <SearchableSelect
                options={modules.map((o) => ({ value: o, label: o }))}
                value={filters.module}
                onChange={(v) => {
                  setFilters((prev) => ({ ...prev, module: v }));
                  setCurrentPage(1);
                }}
                placeholder={isArabic ? 'اختر الموديول' : 'Select Module'}
                className="w-full"
                isRTL={isArabic}
                multiple
              />
            </div>

            <div className="space-y-2">
              <label className={`block ${labelClass}`}>{isArabic ? 'نوع النشاط' : 'Action Type'}</label>
              <SearchableSelect
                options={actionTypes.map((o) => ({ value: o, label: o }))}
                value={filters.type}
                onChange={(v) => {
                  setFilters((prev) => ({ ...prev, type: v }));
                  setCurrentPage(1);
                }}
                placeholder={isArabic ? 'اختر النوع' : 'Select Type'}
                className="w-full"
                isRTL={isArabic}
                multiple
              />
            </div>

            <div className="space-y-2">
              <label className={`flex items-center gap-2 ${labelClass}`}>
                <Calendar className="h-4 w-4 text-blue-500" />
                {isArabic ? 'التاريخ' : 'Date'}
              </label>
              <div>
                <DatePicker
                  popperContainer={({ children }) => createPortal(children, document.body)}
                  selectsRange
                  startDate={filters.dateFrom ? new Date(filters.dateFrom) : null}
                  endDate={filters.dateTo ? new Date(filters.dateTo) : null}
                  onChange={(update) => {
                    const [start, end] = update;
                    const formatDate = (date) => {
                      if (!date) return '';
                      const offset = date.getTimezoneOffset();
                      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                      return localDate.toISOString().split('T')[0];
                    };

                    setCurrentPage(1);
                    setFilters((prev) => ({
                      ...prev,
                      datePeriod: '',
                      dateFrom: formatDate(start),
                      dateTo: formatDate(end),
                    }));
                  }}
                  isClearable
                  placeholderText={isArabic ? 'من - إلى' : 'From - To'}
                  className={inputClass}
                  wrapperClassName="w-full"
                  dateFormat="yyyy-MM-dd"
                />
                <div className="mt-2 flex items-center gap-2">
                  {['today', 'week', 'month'].map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => handleDatePeriodChange(period)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                        filters.datePeriod === period
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : isDark
                            ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {period === 'today' ? (isArabic ? 'اليوم' : 'Today') : period === 'week' ? (isArabic ? 'أسبوع' : 'Week') : (isArabic ? 'شهر' : 'Month')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${glassCard} overflow-hidden`}>
          <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200/70'}`}>
            <div>
              <h3 className={`text-lg font-semibold ${headingClass}`}>{isArabic ? 'سجل الأنشطة' : 'Activity Logs'}</h3>
              <p className={`mt-1 text-xs ${mutedTextClass}`}>
                {isArabic
                  ? `عرض ${Math.min(filtered.length, (currentPage - 1) * itemsPerPage + 1)} - ${Math.min(filtered.length, currentPage * itemsPerPage)} من ${filtered.length}`
                  : `Showing ${Math.min(filtered.length, (currentPage - 1) * itemsPerPage + 1)} - ${Math.min(filtered.length, currentPage * itemsPerPage)} of ${filtered.length}`}
              </p>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className={isDark ? 'bg-slate-950/70' : 'bg-slate-50/90'}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('type')}>
                      {isArabic ? 'نوع النشاط' : 'Action Type'}
                      <ArrowUpDown size={12} className={sortBy === 'type' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('user')}>
                      {isArabic ? 'المستخدم' : 'Performed By'}
                      <ArrowUpDown size={12} className={sortBy === 'user' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('module')}>
                      {isArabic ? 'الموديول' : 'Module'}
                      <ArrowUpDown size={12} className={sortBy === 'module' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('target')}>
                      {isArabic ? 'الهدف' : 'Target'}
                      <ArrowUpDown size={12} className={sortBy === 'target' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('description')}>
                      {isArabic ? 'الوصف' : 'Description'}
                      <ArrowUpDown size={12} className={sortBy === 'description' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('ts')}>
                      {isArabic ? 'الوقت' : 'Timestamp'}
                      <ArrowUpDown size={12} className={sortBy === 'ts' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-theme">
                    <button type="button" className="flex items-center gap-1 hover:text-blue-500" onClick={() => handleSort('ip')}>
                      {isArabic ? 'عنوان IP' : 'IP Address'}
                      <ArrowUpDown size={12} className={sortBy === 'ip' ? 'text-blue-500' : 'opacity-30'} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800 bg-slate-900/60' : 'divide-slate-200 bg-white/85'}`}>
                {isLoading ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center text-theme">
                      {isArabic ? 'جاري التحميل...' : 'Loading...'}
                    </td>
                  </tr>
                ) : sortedAndPaginated.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center text-theme">
                      {isArabic ? 'لا توجد بيانات' : 'No data found'}
                    </td>
                  </tr>
                ) : (
                  sortedAndPaginated.map((l, i) => (
                    <tr key={i} className={isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/80'}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${typeToneMap[l.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {l.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-theme">{l.user}</td>
                      <td className="px-4 py-3 text-theme">{l.module || '-'}</td>
                      <td className="px-4 py-3 text-theme">{l.target}</td>
                      <td className="px-4 py-3 text-theme">{l.description}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${mutedTextClass}`} dir="ltr">{l.ts}</td>
                      <td className="px-4 py-3 font-mono text-xs text-theme">{l.ip}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
            {isLoading ? (
              <div className={`rounded-2xl border px-4 py-8 text-center text-sm ${isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'}`}>
                {isArabic ? 'جاري التحميل...' : 'Loading...'}
              </div>
            ) : sortedAndPaginated.length === 0 ? (
              <div className={`rounded-2xl border px-4 py-8 text-center text-sm ${isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'}`}>
                {isArabic ? 'لا توجد بيانات' : 'No data found'}
              </div>
            ) : (
              sortedAndPaginated.map((l, i) => (
                <div key={i} className={`${glassCard} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${typeToneMap[l.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                        {l.type}
                      </span>
                      <h4 className={`text-sm font-semibold ${headingClass}`}>{l.description}</h4>
                    </div>
                    <span className={`font-mono text-[11px] ${mutedTextClass}`} dir="ltr">{l.ts}</span>
                  </div>

                  <div className={`mt-3 grid grid-cols-2 gap-3 text-xs ${mutedTextClass}`}>
                    <div>
                      <span className="block">{isArabic ? 'المستخدم' : 'User'}</span>
                      <span className={`mt-1 block font-medium ${headingClass}`}>{l.user}</span>
                    </div>
                    <div>
                      <span className="block">{isArabic ? 'الموديول' : 'Module'}</span>
                      <span className={`mt-1 block font-medium ${headingClass}`}>{l.module || '-'}</span>
                    </div>
                    <div>
                      <span className="block">{isArabic ? 'الهدف' : 'Target'}</span>
                      <span className={`mt-1 block font-medium ${headingClass}`}>{l.target}</span>
                    </div>
                    <div>
                      <span className="block">{isArabic ? 'عنوان IP' : 'IP Address'}</span>
                      <span className={`mt-1 block font-mono text-[11px] ${headingClass}`}>{l.ip}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className={`mt-5 flex items-center justify-between rounded-[22px] border px-4 py-3 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200/70 bg-white/80'}`}>
          <div className={`text-xs ${mutedTextClass}`}>
            {isArabic
              ? `صفحة ${currentPage} من ${totalPages}`
              : `Page ${currentPage} of ${totalPages}`}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  isDark ? 'hover:bg-slate-800 text-slate-100' : 'hover:bg-slate-100 text-slate-700'
                }`}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                title={isArabic ? 'السابق' : 'Prev'}
              >
                <ChevronLeft className={`h-5 w-5 ${isArabic ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  isDark ? 'hover:bg-slate-800 text-slate-100' : 'hover:bg-slate-100 text-slate-700'
                }`}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                title={isArabic ? 'التالي' : 'Next'}
              >
                <ChevronRight className={`h-5 w-5 ${isArabic ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className={`${inputClass} h-9 w-20 px-2 py-0`}
            >
              {[5, 10, 20, 50].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
