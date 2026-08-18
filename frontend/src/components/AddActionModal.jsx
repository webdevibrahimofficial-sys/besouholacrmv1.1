import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaPhone, FaEnvelope, FaCalendarAlt, FaClock, FaComments, FaHandshake, FaFileAlt, FaTimes, FaChevronDown, FaToggleOn, FaToggleOff, FaTrash, FaPlus } from 'react-icons/fa';
import { useTheme } from '../shared/context/ThemeProvider.jsx';
import { useAppState } from '../shared/context/AppStateProvider.jsx';
import { api } from '../utils/api';
import { setLastActionStageId } from '../utils/lastActionStage';
import { buildLeadTransferPayload } from '../shared/utils/leadTransfer';
import { getCrmDateFormat, formatPartsByCrmDateFormat } from '../shared/utils/crmDateTime';
import { isSuperAdminUser, isTenantAdminUser } from '../services/leadPermissions';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { flip, offset, shift, size } from '@floating-ui/react';
import './AddActionModalDatepicker.css';
import SearchableSelect from './SearchableSelect.jsx';
import { CATEGORY_TYPE_SERVICES, categoryTypeFromRecord } from '../features/inventory/categoryType';

const toNumericAmountString = (value) => {
  if (value === '' || value == null) return '';
  const parsed = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (parsed === '' || parsed === '-' || parsed === '.' || parsed === '-.') return '';
  return Number.isFinite(Number(parsed)) ? parsed : '';
};

const getUnitSellingPrice = (property) => toNumericAmountString(
  property?.price
  ?? property?.total_price
  ?? property?.totalPrice
  ?? property?.unit_price
  ?? property?.total_after_discount
  ?? property?.totalAfterDiscount
);

const AddActionModal = ({ isOpen, onClose, onSave, lead, inline = false, initialType = 'call', initialDate, isOwnerProp, isSuperAdminProp: _isSuperAdminProp }) => {
  const { i18n } = useTranslation();
  const { theme: _theme, resolvedTheme } = useTheme();
  const { user, company, crmSettings } = useAppState();
  const isLight = resolvedTheme === 'light';
  const crmDateFormat = getCrmDateFormat(crmSettings);
  const datePickerFormat = useMemo(() => {
    if (crmDateFormat === 'MM/DD/YYYY') return 'MM/dd/yyyy';
    if (crmDateFormat === 'YYYY-MM-DD') return 'yyyy-MM-dd';
    return 'dd/MM/yyyy';
  }, [crmDateFormat]);
  const _lintKeep = { createPortal, DatePicker, SearchableSelect, FaClock, FaHandshake, FaTimes, FaChevronDown, FaToggleOn, FaToggleOff, FaTrash, FaPlus };

  const isRTL = i18n.dir() === 'rtl';
  const isArabic = isRTL;
  const numberFormatter = useMemo(() => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  }), []);
  const numericFieldProps = {
    dir: 'ltr',
    lang: 'en',
    inputMode: 'decimal',
    style: { direction: 'ltr', unicodeBidi: 'plaintext' },
  };
  const formatDisplayNumber = (value) => {
    const n = Number(String(value ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n)) return '';
    return numberFormatter.format(n);
  };
  const parseDisplayNumber = (value) => String(value ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '');
  const stageLabel = (stage) => {
    if (!stage) return '';
    const ar = stage?.name_ar || stage?.nameAr || stage?.title_ar || stage?.titleAr;
    const en = stage?.name || stage?.name_en || stage?.nameEn || stage?.title || stage?.display_name || stage?.displayName;
    return isArabic ? (ar || en || '') : (en || ar || '');
  };
  const normalizeStageToken = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const normalizeStageBehaviorToken = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const isReservationAction = (value) => normalizeStageBehaviorToken(value) === 'reservation';
  const isClosingDealAction = (value) => {
    const normalized = normalizeStageBehaviorToken(value);
    return [
      'closing_deals',
      'closing_deal',
      'close_deal',
      'close_deals',
      'done_deal',
      'done_deals',
      'deal',
    ].includes(normalized);
  };
  const companyTypeLower = String(company?.company_type || '').toLowerCase();
  const isRealEstateTenant = companyTypeLower.includes('real');
  const defaultReservationType = isRealEstateTenant ? 'project' : 'general';
  const isTelesalesWorkflowLead = String(lead?.workflow_key || '').trim().toLowerCase() === 'telesales';
  const telesalesPermissions = Array.isArray(user?.meta_data?.module_permissions?.Telesales)
    ? user.meta_data.module_permissions.Telesales
    : [];
  const canConvertTelesalesToSales =
    isSuperAdminUser(user) ||
    isTenantAdminUser(user) ||
    telesalesPermissions.includes('transferToSales');

  const [stages, setStages] = useState([]);
  const [units, setUnits] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [salesAssignees, setSalesAssignees] = useState([]);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingReservationSnapshot, setIsLoadingReservationSnapshot] = useState(false);
  const cancelAutoNotesRef = useRef('');
  const cancelNotesTouchedRef = useRef(false);
  const notInterestAutoNotesRef = useRef('');
  const notInterestNotesTouchedRef = useRef(false);
  const closingRevenueAutoRef = useRef('');
  const [transferFilterRole, setTransferFilterRole] = useState('All');
  const [transferSearchQuery, setTransferSearchQuery] = useState('');
  const [transferSelectedUser, setTransferSelectedUser] = useState(null);
  const [transferMethod, setTransferMethod] = useState('fresh');
  const [transferAssignRole, setTransferAssignRole] = useState('sales');

  const getStageUiBehavior = (stage) => {
    if (!stage) {
      return {
        stage_key: '',
        selectable_in_add_action: true,
        is_transfer: false,
        is_terminal: false,
        requires_schedule: true,
        requires_answer_toggle: true,
        comment_required: true,
        reason_type: null,
        default_action_type: 'call',
        auto_answer_status: null,
      };
    }

    const serverBehavior = stage?.ui_behavior && typeof stage.ui_behavior === 'object' ? stage.ui_behavior : {};
    const stageTypeToken = normalizeStageBehaviorToken(stage?.type || '');
    const fallbackKey = serverBehavior.stage_key || stageTypeToken;
    const reasonType = serverBehavior.reason_type
      || (fallbackKey === 'cancel' ? 'cancel' : (fallbackKey === 'not_interested' ? 'not_interest' : null));
    const isTransfer = typeof serverBehavior.is_transfer === 'boolean'
      ? serverBehavior.is_transfer
      : ['convert', 'transfer', 'transferred'].includes(fallbackKey);
    const isTerminal = typeof serverBehavior.is_terminal === 'boolean'
      ? serverBehavior.is_terminal
      : (isClosingDealAction(fallbackKey) || ['cancel', 'not_interested'].includes(fallbackKey));

    return {
      stage_key: String(fallbackKey || ''),
      selectable_in_add_action: typeof serverBehavior.selectable_in_add_action === 'boolean'
        ? serverBehavior.selectable_in_add_action
        : !Boolean(serverBehavior.display_only),
      is_transfer: isTransfer,
      is_terminal: isTerminal,
      requires_schedule: typeof serverBehavior.requires_schedule === 'boolean' ? serverBehavior.requires_schedule : (!isTransfer && !isTerminal),
      requires_answer_toggle: typeof serverBehavior.requires_answer_toggle === 'boolean' ? serverBehavior.requires_answer_toggle : (!isTransfer && !['cancel', 'not_interested'].includes(fallbackKey)),
      comment_required: typeof serverBehavior.comment_required === 'boolean' ? serverBehavior.comment_required : !['cancel', 'not_interested'].includes(fallbackKey),
      reason_type: reasonType,
      default_action_type: serverBehavior.default_action_type || (fallbackKey === 'cancel' ? 'cancel' : (isClosingDealAction(fallbackKey) ? 'closing_deals' : (['proposal', 'reservation', 'rent', 'meeting'].includes(fallbackKey) ? fallbackKey : 'call'))),
      auto_answer_status: serverBehavior.auto_answer_status || (fallbackKey === 'cancel' ? 'cancelled' : (fallbackKey === 'not_interested' ? 'answer' : null)),
    };
  };

  useEffect(() => {
    const fetchStages = async () => {
      try {
        const response = await api.get('/api/stages', {
          params: { workflow_key: lead?.workflow_key || (isTelesalesWorkflowLead ? 'telesales' : 'sales') }
        });
        setStages(response.data);
      } catch (error) {
        console.error('Failed to fetch stages:', error);
      }
    };
    fetchStages();
  }, []);

  useEffect(() => {
    if (!isOpen || !isTelesalesWorkflowLead || !canConvertTelesalesToSales) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await api.get('/api/telesales/assignees', { params: { workflow: 'sales' } });
        const list = Array.isArray(response?.data?.data)
          ? response.data.data
          : (Array.isArray(response?.data) ? response.data : []);
        if (!cancelled) {
          setSalesAssignees(list);
        }
      } catch (error) {
        if (!cancelled) {
          setSalesAssignees([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isTelesalesWorkflowLead, canConvertTelesalesToSales]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [propertiesRes, projectsRes, categoriesRes, itemsRes] = await Promise.all([
          // Only fetch selectable units for reservation/rent dropdowns (hide sold & active reserved)
          api.get('/api/properties?all=1&selectable=1&fields=dropdown'),
          api.get('/api/projects'),
          api.get('/api/item-categories'),
          api.get('/api/items?all=1')
        ]);

        const rawProjects = Array.isArray(projectsRes.data)
          ? projectsRes.data
          : (projectsRes.data.data || []);

        const rawProperties = Array.isArray(propertiesRes.data)
          ? propertiesRes.data
          : (propertiesRes.data.data || []);

        const mappedUnits = rawProperties.map(p => {
          const projectMatch = rawProjects.find(pr =>
            pr.id === p.project_id ||
            pr.name === p.project ||
            pr.name_ar === p.project ||
            pr.title === p.project
          );

          return {
            id: p.id,
            name: p.unit_code || p.name || p.title || `#${p.id}`,
            project_id: projectMatch ? projectMatch.id : (p.project_id ?? undefined),
            rent_amount: p.rent_cost ?? p.rent_amount ?? p.total_price ?? 0,
            price: getUnitSellingPrice(p),
          };
        });

        setUnits(mappedUnits);
        setProjects(rawProjects);
        setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : (categoriesRes.data.data || []));
        setItems(Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data.data || []));
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };
    fetchData();
  }, []);

  const buildInitialActionData = () => ({
    type: initialType,
    actionType: initialType,
    nextAction: 'follow_up',
    stage_id: '',
    title: '',
    description: '',
    date: initialDate || new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    status: 'pending',
    priority: lead?.priority || 'medium',
    assignedTo: '',
    notes: '',
    meetingType: 'introduction',
    meetingLocation: 'indoor',
    meeting_status: '',
    answerStatus: 'answer',
    selectedQuickOption: null,
    proposalAmount: '',
    proposalDiscount: '',
    proposalValidityDays: '',
    proposalAttachmentUrl: '',
    proposalAttachment: null,
    reservationType: defaultReservationType,
    reservationCategory: '',
    reservationItem: '',
    reservationGeneralItems: [{ category: '', item: '', quantity: 1, price: 0, addon_ids: [], discount_type: 'value', discount_value: '' }],
    reservationNotes: '',
    reservationProject: '',
    reservationUnit: '',
    reservationAmount: '',
    sourceReservationActionId: '',
    sourceReservationLoadedAt: '',
    rentUnit: '',
    rentStart: '',
    rentEnd: '',
    rentAmount: '',
    rentAttachment: null,
    closingRevenue: '',
    cancelReason: '',
    cancelReasonId: '',
    cancelReasonTitleAr: '',
    notInterestReason: '',
    notInterestReasonId: '',
    notInterestReasonTitleAr: '',
    doneMeeting: false
  });

  const [actionData, setActionData] = useState(buildInitialActionData);

  useEffect(() => {
    if (!isOpen) return;
    closingRevenueAutoRef.current = '';
    setActionData(buildInitialActionData());
    setTransferFilterRole('All');
    setTransferSearchQuery('');
    setTransferSelectedUser(null);
    setTransferMethod('fresh');
    setTransferAssignRole('sales');
  }, [isOpen, lead?.id, initialType, initialDate]);

  // Reservation type is automatic based on tenant (Real Estate => project, otherwise general).
  useEffect(() => {
    if (!isOpen) return;
    if (!isReservationAction(actionData.nextAction) && !isClosingDealAction(actionData.nextAction)) return;
    if (actionData.reservationType === defaultReservationType) return;
    setActionData((prev) => ({ ...prev, reservationType: defaultReservationType }));
  }, [isOpen, actionData.nextAction, actionData.reservationType, defaultReservationType]);

  const pad2 = (n) => String(n).padStart(2, '0');
  const toLocalDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const toLocalTimeStr = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const parseHHmm = (value) => {
    if (typeof value !== 'string') return null;
    const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;
    return { hours, minutes };
  };

  const toHHmm = (hours, minutes) => `${pad2(hours)}:${pad2(minutes)}`;

  const ScheduleTimeInput = ({ date, value, onChange }) => {
    const parsed = parseHHmm(value);
    const fallback = (date instanceof Date && !Number.isNaN(date.getTime())) ? date : new Date();
    const hours = parsed ? parsed.hours : fallback.getHours();
    const minutes = parsed ? parsed.minutes : fallback.getMinutes();
    const hhmm = toHHmm(hours, minutes);
    const meridiem = hours >= 12 ? 'PM' : 'AM';

    const btnBase = `px-2 py-1 rounded-md text-xs border transition-colors ${isLight ? 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50' : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'}`;
    const btnActive = 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700';

    const commit = (h, m) => onChange(toHHmm(clamp(h, 0, 23), clamp(m, 0, 59)));

    const stepHours = (delta) => {
      const d = (date instanceof Date && !Number.isNaN(date.getTime())) ? new Date(date) : new Date();
      d.setHours(hours + delta);
      commit(d.getHours(), minutes);
    };

    const setMer = (mer) => {
      const base = hours % 12;
      const nextHours = (mer === 'PM') ? base + 12 : base;
      commit(nextHours, minutes);
    };

    return (
      <div className={`add-action-time-input-compact ${isRTL ? 'rtl' : ''}`}>
        <div className="add-action-time-input-compact__row">
          <input
            type="time"
            step={60}
            value={hhmm}
            onChange={(e) => onChange(e.target.value)}
            className={`add-action-time-input-compact__time w-full px-2 py-1.5 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'bg-white border-gray-300 text-slate-900' : 'bg-gray-800 border-gray-600 text-white'}`}
            aria-label={isArabic ? 'الوقت' : 'Time'}
          />
          <button type="button" onClick={() => stepHours(-1)} className={btnBase} aria-label="Minus 1 hour">-1h</button>
          <button type="button" onClick={() => stepHours(1)} className={btnBase} aria-label="Plus 1 hour">+1h</button>
          <button type="button" onClick={() => setMer('AM')} className={`${btnBase} ${meridiem === 'AM' ? btnActive : ''}`}>AM</button>
          <button type="button" onClick={() => setMer('PM')} className={`${btnBase} ${meridiem === 'PM' ? btnActive : ''}`}>PM</button>
        </div>
      </div>
    );
  };

  const getScheduleDate = () => {
    try {
      const raw = new Date(`${actionData.date}T${actionData.time}`);
      return Number.isNaN(raw.getTime()) ? null : raw;
    } catch {
      return null;
    }
  };

  const getScheduleDay = () => {
    try {
      if (!actionData.date) return null;
      const raw = new Date(`${actionData.date}T00:00:00`);
      return Number.isNaN(raw.getTime()) ? null : raw;
    } catch {
      return null;
    }
  };

  const setScheduleDateOnly = (d) => {
    if (!d) return;
    setActionData(prev => ({
      ...prev,
      date: toLocalDateStr(d),
      time: prev.time || toLocalTimeStr(new Date()),
      selectedQuickOption: null
    }));
  };

  const getScheduleTimeParts = () => {
    const parsed = parseHHmm(actionData.time);
    const fallback = new Date();
    const hours24 = parsed ? parsed.hours : fallback.getHours();
    const minutes = parsed ? parsed.minutes : fallback.getMinutes();
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hour12 = (hours24 % 12) === 0 ? 12 : (hours24 % 12);
    return { hours24, minutes, period, hour12 };
  };

  const formatScheduleTime = ({ hour12, minutes, period }) => {
    const ampm = isArabic ? (period === 'AM' ? 'ص' : 'م') : period;
    return `${pad2(hour12)}:${pad2(minutes)} ${ampm}`;
  };

  const formatScheduleDate = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return formatPartsByCrmDateFormat(
      {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      },
      crmDateFormat
    );
  };

  const handleScheduleClickOutside = (event) => {
    // The time dropdowns inside the calendar are rendered in a portal (document.body),
    // which would otherwise be treated as an "outside click" and close the datepicker.
    const target = event?.target;
    if (target instanceof Element && target.closest('[data-searchable-select-dropdown="true"]')) return;
    setSchedulePickerOpen(false);
  };

  const ScheduleDateTimeInput = forwardRef(function ScheduleDateTimeInput(_props, ref) {
    const day = getScheduleDay();
    const displayDate = day ? formatScheduleDate(day) : '';
    const displayTime = actionData.time ? formatScheduleTime(getScheduleTimeParts()) : '';
    const displayValue = [displayDate, displayTime].filter(Boolean).join('  ');

    const baseClasses = isLight
      ? 'w-full px-4 py-3 bg-white border border-gray-300 text-slate-900'
      : 'w-full px-4 py-3 bg-gray-800 border border-gray-600 text-white';

    return (
      <div className="relative" onClick={() => setSchedulePickerOpen(true)}>
        <FaCalendarAlt className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
        <FaClock className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
        <input
          ref={ref}
          type="text"
          readOnly
          value={displayValue}
          onFocus={() => setSchedulePickerOpen(true)}
          className={`${baseClasses} ${isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer`}
          placeholder={isArabic ? 'اختر التاريخ والوقت' : 'Select date & time'}
          dir={isRTL ? 'rtl' : 'ltr'}
        />
      </div>
    );
  });

  const setScheduleTimeParts = ({ hour12, minutes, period }) => {
    const safeHour12 = clamp(Number(hour12), 1, 12);
    const safeMinutes = clamp(Number(minutes), 0, 59);
    const base = safeHour12 % 12;
    const hours24 = (period === 'PM') ? base + 12 : base;
    const nextTime = toHHmm(hours24, safeMinutes);
    setActionData(prev => ({
      ...prev,
      time: nextTime,
      selectedQuickOption: null
    }));
  };

  const setScheduleFromDate = (d) => {
    setActionData(prev => ({
      ...prev,
      date: toLocalDateStr(d),
      time: toLocalTimeStr(d),
      selectedQuickOption: null
    }));
  };

  const clearSchedule = () => {
    setActionData(prev => ({
      ...prev,
      date: '',
      time: '',
      selectedQuickOption: null
    }));
  };

  const SchedulePopperContainer = ({ children }) =>
    createPortal(<div className="relative z-[10050]">{children}</div>, document.body);

  const ScheduleCalendarContainer = ({ className, children }) => (
    <div className={className}>
      {children}
      <div className={`add-action-datepicker-time-controls w-full border-t ${isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-900'} px-3 py-3`}>
        <div className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-900' : 'text-gray-100'} ${isRTL ? 'text-right' : 'text-left'}`}>
          {isArabic ? 'اختيار الوقت' : 'Choose time'}
        </div>
        {(() => {
          const { hour12, minutes, period } = getScheduleTimeParts();
          const hourOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: pad2(i + 1) }));
          const minuteOptions = Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: pad2(i) }));
          const periodOptions = [
            { value: 'AM', label: isArabic ? 'ص' : 'AM' },
            { value: 'PM', label: isArabic ? 'م' : 'PM' },
          ];
          const selectClass = `${isLight ? 'bg-white border border-gray-300 text-slate-900' : 'bg-gray-800 border border-gray-600 text-white'} rounded-lg h-10 px-3`;

          const hourSelect = (
            <SearchableSelect
              options={hourOptions}
              value={String(hour12)}
              onChange={(v) => setScheduleTimeParts({ hour12: v, minutes, period })}
              placeholder={isArabic ? 'ساعة' : 'Hour'}
              isRTL={isRTL}
              className={selectClass}
              showAllOption={false}
              isClearable={false}
              dropdownZIndex={10080}
            />
          );

          const minuteSelect = (
            <SearchableSelect
              options={minuteOptions}
              value={String(minutes)}
              onChange={(v) => setScheduleTimeParts({ hour12, minutes: v, period })}
              placeholder={isArabic ? 'دقيقة' : 'Minute'}
              isRTL={isRTL}
              className={selectClass}
              showAllOption={false}
              isClearable={false}
              dropdownZIndex={10080}
            />
          );

          const periodSelect = (
            <SearchableSelect
              options={periodOptions}
              value={period}
              onChange={(v) => setScheduleTimeParts({ hour12, minutes, period: v })}
              placeholder={isArabic ? 'ص/م' : 'AM/PM'}
              isRTL={isRTL}
              className={selectClass}
              showAllOption={false}
              isClearable={false}
              dropdownZIndex={10080}
            />
          );

          return (
            <div className="grid grid-cols-3 gap-2 items-center">
              {isRTL ? (
                <>
                  {hourSelect}
                  {minuteSelect}
                  {periodSelect}
                </>
              ) : (
                <>
                  {hourSelect}
                  {minuteSelect}
                  {periodSelect}
                </>
              )}
            </div>
          );
        })()}
      </div>
      <div
        className={`add-action-datepicker-footer clear-both w-full border-t ${isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-900'} px-3 py-2 flex flex-wrap items-center justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}
      >
        <button
          type="button"
          onClick={clearSchedule}
          className="add-action-datepicker-btn add-action-datepicker-btn--link"
        >
          {isArabic ? 'مسح' : 'Clear'}
        </button>
        <button
          type="button"
          onClick={() => setScheduleFromDate(new Date())}
          className="add-action-datepicker-btn add-action-datepicker-btn--secondary"
        >
          {isArabic ? 'اليوم' : 'Today'}
        </button>
        <button
          type="button"
          onClick={() => setSchedulePickerOpen(false)}
          className="add-action-datepicker-btn add-action-datepicker-btn--primary"
        >
          {isArabic ? 'تأكيد' : 'Confirm'}
        </button>
      </div>
    </div>
  );

  const applyStageSelection = (stageId) => {
    const stage = (Array.isArray(stages) ? stages : []).find(s => String(s.id) === String(stageId));
    if (!stage) return false;
    const uiBehavior = getStageUiBehavior(stage);
    if (isTelesalesWorkflowLead && !uiBehavior.selectable_in_add_action) {
      return false;
    }
    if (isTelesalesWorkflowLead && !canConvertTelesalesToSales && uiBehavior.is_transfer) {
      return false;
    }

    setActionData(prev => ({
      ...prev,
      stage_id: String(stageId),
      nextAction: stage.type,
      actionType: uiBehavior.default_action_type,
      type: uiBehavior.default_action_type,
      status: uiBehavior.is_terminal ? 'completed' : 'pending',
      selectedQuickOption: uiBehavior.requires_schedule ? prev.selectedQuickOption : null,
      ...(uiBehavior.auto_answer_status ? { answerStatus: uiBehavior.auto_answer_status } : {})
    }));

    return true;
  };

  const getStageIdFromStageName = (stageName) => {
    if (!stageName || !Array.isArray(stages) || stages.length === 0) return null;
    const normalized = normalizeStageToken(stageName);
    if (!normalized) return null;

    const matched = stages.find((s) => {
      const uiBehavior = getStageUiBehavior(s);
      if (isTelesalesWorkflowLead && !uiBehavior.selectable_in_add_action) {
        return false;
      }
      if (isTelesalesWorkflowLead && !canConvertTelesalesToSales && uiBehavior.is_transfer) {
        return false;
      }
      const names = [
        s.name,
        s.name_en,
        s.nameEn,
        s.name_ar,
        s.nameAr,
        s.title,
        s.title_ar,
        s.titleAr,
        s.display_name,
        s.displayName,
        s.key,
        s.type,
      ].filter(Boolean);
      return names.some((n) => normalizeStageToken(n) === normalized);
    });

    return matched ? String(matched.id) : null;
  };

  const selectableStages = useMemo(() => {
    if (!Array.isArray(stages)) return [];
    if (!isTelesalesWorkflowLead) return stages;

    return stages.filter((stage) => {
      const uiBehavior = getStageUiBehavior(stage);
      const normalizedStageKey = normalizeStageToken(uiBehavior.stage_key || stage?.name || stage?.type || '');
      const isHiddenTelesalesStage = ['fresh', 'cold calls', 'cold call', 'new lead'].includes(normalizedStageKey);

      if (isHiddenTelesalesStage && String(stage?.id) !== String(actionData.stage_id || '')) {
        return false;
      }
      if (!uiBehavior.selectable_in_add_action) return false;
      if (!canConvertTelesalesToSales && uiBehavior.is_transfer) return false;
      return true;
    });
  }, [actionData.stage_id, canConvertTelesalesToSales, isTelesalesWorkflowLead, stages]);

  const selectedStage = useMemo(
    () => (Array.isArray(stages) ? stages.find((s) => String(s.id) === String(actionData.stage_id || '')) : null),
    [actionData.stage_id, stages]
  );
  const selectedStageBehavior = useMemo(() => getStageUiBehavior(selectedStage), [selectedStage]);

  const isTransferStageSelected = Boolean(selectedStageBehavior?.is_transfer);
  const showReservationFields = isReservationAction(actionData.nextAction) || isClosingDealAction(actionData.nextAction);

  const transferRoleOptions = useMemo(
    () => ['All', ...Array.from(new Set((Array.isArray(salesAssignees) ? salesAssignees : []).map((entry) => String(entry?.role || entry?.job_title || '').trim()).filter(Boolean)))],
    [salesAssignees]
  );

  const filteredSalesAssignees = useMemo(() => {
    return (Array.isArray(salesAssignees) ? salesAssignees : []).filter((entry) => {
      const role = String(entry?.role || entry?.job_title || '').trim();
      const matchesRole = transferFilterRole === 'All' || role.toLowerCase() === transferFilterRole.toLowerCase();
      const query = transferSearchQuery.toLowerCase().trim();
      const matchesSearch = query === ''
        || String(entry?.name || '').toLowerCase().includes(query)
        || String(entry?.email || '').toLowerCase().includes(query);
      return matchesRole && matchesSearch;
    });
  }, [salesAssignees, transferFilterRole, transferSearchQuery]);

  const canAssignTransferAsManager = useMemo(() => {
    if (!transferSelectedUser) return false;
    const role = String(transferSelectedUser?.role || transferSelectedUser?.job_title || '').toLowerCase();
    const isLeadership = role.includes('manager')
      || role.includes('leader')
      || role.includes('director')
      || role.includes('admin')
      || role.includes('owner')
      || role.includes('operation manager')
      || role.includes('operations manager');
    const isAgent = role.includes('agent')
      || role.includes('telesales')
      || role.includes('sales person')
      || role.includes('salesperson')
      || role.includes('sales agent');

    return isLeadership && !isAgent;
  }, [transferSelectedUser]);

  useEffect(() => {
    if (!transferSelectedUser) return;
    const role = String(transferSelectedUser?.role || transferSelectedUser?.job_title || '').toLowerCase();
    const isLeadership = role.includes('manager')
      || role.includes('leader')
      || role.includes('director')
      || role.includes('admin')
      || role.includes('owner')
      || role.includes('operation manager')
      || role.includes('operations manager');
    const isAgent = role.includes('agent')
      || role.includes('telesales')
      || role.includes('sales person')
      || role.includes('salesperson')
      || role.includes('sales agent');
    setTransferAssignRole(isLeadership && !isAgent ? 'manager' : 'sales');
  }, [transferSelectedUser]);

  const getLeadLastActionStageId = () => {
    const hasAnyActions = (() => {
      const countCandidates = [
        lead?.actions_count,
        lead?.actionsCount,
        lead?.lead_actions_count,
        lead?.leadActionsCount,
      ].filter((v) => v !== null && v !== undefined);
      if (countCandidates.some((v) => Number(v) > 0)) return true;

      const arrays = [lead?.actions, lead?.lead_actions, lead?.leadActions];
      if (arrays.some((a) => Array.isArray(a) && a.length > 0)) return true;

      if (lead?.latestAction || lead?.latest_action || lead?.lastAction || lead?.last_action) return true;
      return false;
    })();

    const directCandidates = [
      lead?.latestAction?.stage_id,
      lead?.latestAction?.stageId,
      lead?.latest_action?.stage_id,
      lead?.latest_action?.stageId,
      lead?.lastAction?.stage_id,
      lead?.lastAction?.stageId,
      lead?.last_action?.stage_id,
      lead?.last_action?.stageId,
    ];

    for (const candidate of directCandidates) {
      if (candidate !== null && candidate !== undefined && String(candidate).trim() !== '') {
        return String(candidate);
      }
    }

    const actions = lead?.actions || lead?.lead_actions || lead?.leadActions;
    if (Array.isArray(actions) && actions.length > 0) {
      const withStage = actions
        .map((a) => ({
          stageId: a?.stage_id ?? a?.stageId ?? a?.stage?.id ?? null,
          createdAt: a?.created_at ?? a?.createdAt ?? null,
        }))
        .filter((a) => a.stageId !== null && a.stageId !== undefined);

      if (withStage.length > 0) {
        withStage.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        if (withStage[0].stageId !== null && withStage[0].stageId !== undefined) {
          return String(withStage[0].stageId);
        }
      }
    }

    // Fallback: if lead has any actions but stageId isn't included in action payloads,
    // prefer the lead's current stage (it should already reflect the latest action stage).
    const stageFromLeadId = lead?.stage_id ?? lead?.stageId ?? lead?.stage?.id ?? null;
    if (hasAnyActions && stageFromLeadId !== null && stageFromLeadId !== undefined && String(stageFromLeadId).trim() !== '') {
      return String(stageFromLeadId);
    }

    // Also support case where lead.stage is the stage name or status (e.g., 'Pending').
    const stageFromLeadName = lead?.stage || lead?.display_stage || lead?.pipelineStage || lead?.stage_name || lead?.stageName || lead?.status || null;
    const mappedId = getStageIdFromStageName(stageFromLeadName);
    if (mappedId) return mappedId;

    return null;
  };

  const [stagePrefillAttempted, setStagePrefillAttempted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStagePrefillAttempted(false);
  }, [isOpen, lead?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (!user?.id) return;
    if (!Array.isArray(stages) || stages.length === 0) return;
    if (actionData.stage_id) return;
    if (stagePrefillAttempted) return;

    setStagePrefillAttempted(true);

    const leadLastActionStageId = getLeadLastActionStageId();
    if (leadLastActionStageId && applyStageSelection(leadLastActionStageId)) return;

    const fallbackFromLeadName = getStageIdFromStageName(
      lead?.stage ||
      lead?.display_stage ||
      lead?.pipelineStage ||
      lead?.stage_name ||
      lead?.stageName ||
      lead?.status ||
      ''
    );
    if (fallbackFromLeadName && applyStageSelection(fallbackFromLeadName)) return;

    // Final fallback: fetch full lead details to get actions/stage reliably
    let cancelled = false;
    (async () => {
      try {
        if (!lead?.id) return;
        const res = await api.get(`/api/leads/${lead.id}`);
        const fullLead = res?.data?.data ?? res?.data;
        if (cancelled || !fullLead) return;

        const actions = fullLead?.actions || fullLead?.lead_actions || fullLead?.leadActions;
        const stageIdFromActions = Array.isArray(actions) && actions.length > 0
          ? actions
              .map((a) => ({
                stageId: a?.stage_id ?? a?.stageId ?? a?.stage?.id ?? null,
                createdAt: a?.created_at ?? a?.createdAt ?? null,
              }))
              .filter((a) => a.stageId !== null && a.stageId !== undefined)
              .sort((a, b) => {
                const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return tb - ta;
              })?.[0]?.stageId
          : null;

        const stageId =
          stageIdFromActions ??
          fullLead?.latestAction?.stage_id ??
          fullLead?.latest_action?.stage_id ??
          fullLead?.lastAction?.stage_id ??
          fullLead?.last_action?.stage_id ??
          fullLead?.stage_id ??
          fullLead?.stage?.id ??
          null;

        const hasAnyActions = Array.isArray(actions) ? actions.length > 0 : false;
        if (hasAnyActions && stageId && applyStageSelection(stageId)) return;
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id, stages, actionData.stage_id, lead?.id, stagePrefillAttempted]);

  const [cancelReasons, setCancelReasons] = useState([]);
  const [notInterestReasons, setNotInterestReasons] = useState([]);

  useEffect(() => {
    const fetchCancelReasons = async () => {
      try {
        const response = await api.get('/api/cancel-reasons');
        setCancelReasons(response.data);
      } catch (error) {
        console.error('Failed to fetch cancel reasons:', error);
      }
    };
    fetchCancelReasons();
  }, []);

  useEffect(() => {
    const fetchNotInterestReasons = async () => {
      try {
        const response = await api.get('/api/not-interest-reasons');
        setNotInterestReasons(response.data);
      } catch (error) {
        console.error('Failed to fetch not interest reasons:', error);
      }
    };
    fetchNotInterestReasons();
  }, []);

  const getItemAddons = (itemId) => {
    const selectedItem = items.find(opt => String(opt.id) === String(itemId));
    return Array.isArray(selectedItem?.addons) ? selectedItem.addons : [];
  };

  const isServiceCatalogItem = (item) => {
    if (!item) return false;
    if (String(item.business_type || '').toLowerCase() === 'service') return true;
    return categoryTypeFromRecord(item) === CATEGORY_TYPE_SERVICES
      || categoryTypeFromRecord(item.category) === CATEGORY_TYPE_SERVICES;
  };

  const categoryTypeLabel = (record) => {
    const type = categoryTypeFromRecord(record);
    if (type === CATEGORY_TYPE_SERVICES) return isArabic ? 'خدمة' : 'Service';
    return isArabic ? 'منتج' : 'Product';
  };

  const isServiceReservationRow = (row) => {
    if (String(row?.business_type || row?.item_type || '').toLowerCase() === 'service') return true;
    const selected = items.find((opt) => String(opt.id) === String(row?.item));
    if (selected) return isServiceCatalogItem(selected);
    const category = categories.find((opt) => String(opt.id) === String(row?.category));
    return categoryTypeFromRecord(category) === CATEGORY_TYPE_SERVICES;
  };

  const getRowAddonIds = (row) => Array.isArray(row?.addon_ids)
    ? row.addon_ids
    : (Array.isArray(row?.addons) ? row.addons.map(addon => addon?.id ?? addon?.addon_id).filter(Boolean) : []);

  const getRowSelectedAddons = (row) => {
    const selectedIds = new Set(getRowAddonIds(row).map((id) => String(id)));
    return getItemAddons(row?.item).filter((addon) => selectedIds.has(String(addon.id)));
  };

  const getAddonAmount = (addon, isService = false) => {
    const price = Number(addon?.price || 0);
    if (isService) return Number.isFinite(price) ? price : 0;
    const quantity = Number(addon?.quantity || 0);
    return (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(price) ? price : 0);
  };

  // Auto-calculate Total Amount for General Reservation
  useEffect(() => {
    if ((isReservationAction(actionData.nextAction) || isClosingDealAction(actionData.nextAction)) && actionData.reservationType === 'general') {
      const total = actionData.reservationGeneralItems.reduce((sum, item) => {
        return sum + getGeneralRowTotals(item).total;
      }, 0);

      setActionData(prev => {
        const shouldSyncRevenue = isClosingDealAction(prev.nextAction);
        if (
          prev.reservationAmount === total &&
          (!shouldSyncRevenue || String(prev.closingRevenue ?? '') === String(total))
        ) {
          return prev;
        }
        return {
          ...prev,
          reservationAmount: total,
          ...(shouldSyncRevenue ? { closingRevenue: total } : {}),
        };
      });
    }
  }, [actionData.reservationGeneralItems, actionData.nextAction, actionData.reservationType, items]);

  // Fetch a reserved/sold unit missing from the selectable dropdown so we can read its price.
  useEffect(() => {
    if (!isOpen) return;
    if (!isClosingDealAction(actionData.nextAction)) return;
    if (actionData.reservationType === 'general') return;
    const unitId = actionData.reservationUnit;
    if (!unitId) return;
    if (units.some((unit) => String(unit.id) === String(unitId))) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await api.get(`/api/properties/${unitId}`);
        const property = response?.data?.data ?? response?.data;
        if (cancelled || !property?.id) return;
        setUnits((prev) => {
          if (prev.some((unit) => String(unit.id) === String(property.id))) return prev;
          return [
            ...prev,
            {
              id: property.id,
              name: property.unit_code || property.name || property.title || `#${property.id}`,
              project_id: property.project_id ?? undefined,
              rent_amount: property.rent_cost ?? property.rent_amount ?? property.total_price ?? 0,
              price: getUnitSellingPrice(property),
            },
          ];
        });
      } catch (error) {
        console.error('Failed to fetch selected unit price:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, actionData.nextAction, actionData.reservationType, actionData.reservationUnit, units]);

  // Auto-fill Revenue from the selected unit's selling price for real-estate closing deals.
  // Do not copy Reservation Amount, and do not overwrite a value the user already typed.
  useEffect(() => {
    if (!isClosingDealAction(actionData.nextAction)) return;
    if (actionData.reservationType === 'general') return;

    const selectedUnit = units.find((unit) => String(unit.id) === String(actionData.reservationUnit));
    const unitPrice = selectedUnit ? (selectedUnit.price || getUnitSellingPrice(selectedUnit)) : '';

    setActionData((prev) => {
      if (!isClosingDealAction(prev.nextAction)) return prev;
      const current = String(prev.closingRevenue ?? '');
      const lastAuto = String(closingRevenueAutoRef.current ?? '');
      const next = String(unitPrice ?? '');
      const shouldFill = current === '' || current === lastAuto;
      if (!shouldFill) return prev;
      if (current === next) {
        closingRevenueAutoRef.current = next;
        return prev;
      }
      closingRevenueAutoRef.current = next;
      return { ...prev, closingRevenue: next };
    });
  }, [actionData.nextAction, actionData.reservationType, actionData.reservationUnit, units]);

  const actionTypes = [
    { value: 'call', label: isArabic ? 'مكالمة' : 'Call', icon: FaPhone, color: 'bg-blue-500' },
    { value: 'whatsapp', label: 'WhatsApp', icon: FaComments, color: 'bg-green-500' },
    { value: 'email', label: isArabic ? 'بريد' : 'Email', icon: FaEnvelope, color: 'bg-yellow-500' },
    { value: 'google_meet', label: 'Google Meet', icon: FaCalendarAlt, color: 'bg-purple-500' },
    { value: 'sms', label: isArabic ? 'رسالة' : 'Sms', icon: FaFileAlt, color: 'bg-teal-500' },
    { value: 'comment', label: isArabic ? 'تعليق' : 'Comment', icon: FaComments, color: 'bg-gray-500' },
    { value: 'note', label: isArabic ? 'ملاحظة' : 'Note', icon: FaFileAlt, color: 'bg-amber-500' },
    { value: 'closing_deals', label: isArabic ? 'إغلاق صفقة' : 'Closing Deal', icon: FaHandshake, color: 'bg-emerald-500' }
  ];

  const leadPermissions = lead?.permissions || {};

  const pickNumericId = (...vals) => {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'object') {
        const oid = v.id ?? v.user_id ?? v.userId;
        if (oid !== undefined && oid !== null && String(oid).match(/^\\d+$/)) return String(oid);
        continue;
      }
      const s = String(v).trim();
      if (s.match(/^\\d+$/)) return s;
    }
    return null;
  };

  const roleLower = String(user?.role || '').toLowerCase();
  const isSalesPersonUser =
    roleLower.includes('sales person') ||
    roleLower.includes('salesperson') ||
    roleLower.includes('sales_person');

  // Ownership MUST be based on the real assignment id, not display fields like `sales_person` (string).
  const assignedToId = pickNumericId(
    lead?.assigned_to_id,
    lead?.assignedSalesId,
    lead?.assigned_sales_id,
    lead?.salesPersonId,
    lead?.sales_person_id,
    lead?.employeeId,
    lead?.employee_id,
    lead?.assigneeId,
    lead?.assignee_id,
    lead?.assignedUserId,
    lead?.assigned_user_id,
    lead?.assigned_to,
    lead?.assignedTo,
    lead?.assignedAgent?.id,
    lead?.assigned_agent?.id,
    lead?.assigned_sales
  );

  const createdById = pickNumericId(
    lead?.created_by,
    lead?.createdBy,
    lead?.created_by_id,
    lead?.creator_id,
    lead?.creator?.id,
    lead?.creatorId
  );

  const normalizeName = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const assignedToName =
    (typeof lead?.assigned_to === 'object' ? lead?.assigned_to?.name : '') ||
    (typeof lead?.assignedTo === 'object' ? lead?.assignedTo?.name : '') ||
    (typeof lead?.assignedAgent === 'object' ? lead?.assignedAgent?.name : '') ||
    (typeof lead?.assigned_agent === 'object' ? lead?.assigned_agent?.name : '') ||
    lead?.sales_person_name ||
    lead?.salesPersonName ||
    lead?.employee_name ||
    lead?.assigned_to_name ||
    lead?.assignedToName ||
    (typeof lead?.sales_person === 'string' && isNaN(Number(lead?.sales_person)) ? lead?.sales_person : '') ||
    '';

  const isOwnerById = assignedToId && String(assignedToId) === String(user?.id);
  const isOwnerByName =
    !assignedToId &&
    assignedToName &&
    user?.name &&
    normalizeName(assignedToName) === normalizeName(user?.name);
  const isOwnerByCreatorFallback =
    !assignedToId && isSalesPersonUser && createdById && String(createdById) === String(user?.id);

  // NOTE: Do not trust `isOwnerProp` (some callers computed it using display fields).
  // Owner is derived only from assignment id (or the safe Sales-Person creator fallback for legacy data).
  const isOwner = Boolean(isOwnerById || isOwnerByName || isOwnerByCreatorFallback);

  // Backend is the source of truth for action authorization.
  // Fallback to owner-only logic only when the permission payload is not present yet.
  const canAddAction =
    typeof lead?.permissions?.can_add_action === 'boolean'
      ? lead.permissions.can_add_action
      : isOwner;
  const filteredActionTypes = canAddAction ? actionTypes : [];

  const callSubTypes = [
    { value: 'incoming', label: isArabic ? 'وارد' : 'Incoming' },
    { value: 'outgoing', label: isArabic ? 'صادر' : 'Outgoing' },
    { value: 'missed', label: isArabic ? 'فائتة' : 'Missed' }
  ];

  const emailSubTypes = [
    { value: 'sent', label: isArabic ? 'مرسل' : 'Sent' },
    { value: 'reply', label: isArabic ? 'رد' : 'Reply' }
  ];

  const nextActionOptions = [
    { value: 'follow_up', label: isArabic ? 'متابعة' : 'Follow Up' },
    { value: 'meeting', label: isArabic ? 'اجتماع' : 'Meeting' },
    { value: 'proposal', label: isArabic ? 'عرض سعر' : 'Proposal' },
    { value: 'reservation', label: isArabic ? 'حجز' : 'Reservation' },
    { value: 'closing_deals', label: isArabic ? 'إغلاق الصفقات' : 'Closing Deals' },
    { value: 'rent', label: isArabic ? 'إيجار' : 'Rent' },
    { value: 'cancel', label: isArabic ? 'إلغاء' : 'Cancel' },
    { value: 'not_interested', label: isArabic ? 'غير مهتم' : 'Not Interested' }
  ];

  const meetingTypes = [
    { value: 'introduction', label: isArabic ? 'اجتماع تعريفي' : 'Introduction Meeting' },
    { value: 'follow_up', label: isArabic ? 'اجتماع متابعة' : 'Follow-up Meeting' },
    { value: 'presentation', label: isArabic ? 'اجتماع عرض' : 'Presentation Meeting' },
    { value: 'negotiation', label: isArabic ? 'اجتماع تفاوض' : 'Negotiation Meeting' }
  ];

  const meetingLocations = [
    { value: 'indoor', label: isArabic ? 'داخلي' : 'Indoor' },
    { value: 'outdoor', label: isArabic ? 'خارجي' : 'Outdoor' },
    { value: 'online', label: isArabic ? 'عبر الإنترنت' : 'Online' },
    { value: 'client_office', label: isArabic ? 'مكتب العميل' : 'Client Office' }
  ];

  const reservationTypes = [
    { value: 'project', label: isArabic ? 'مشروع' : 'Project' },
    { value: 'general', label: isArabic ? 'عام' : 'General' }
  ];
  const reservationTypeLabel = useMemo(() => {
    const opt = reservationTypes.find((x) => x.value === defaultReservationType);
    return opt ? opt.label : (defaultReservationType === 'general' ? (isArabic ? 'عام' : 'General') : (isArabic ? 'مشروع' : 'Project'));
  }, [defaultReservationType, isArabic]);

  const meetingStatuses = [
    { value: 'done', label: isArabic ? 'تم الاجتماع' : 'Meeting Done', color: 'bg-green-500' },
    { value: 'no_show', label: isArabic ? 'لم يحضر (ميسد)' : 'No Show (Missed)', color: 'bg-red-500' }
  ];

  const handleStatusChange = (status) => {
    const selectedStatus = meetingStatuses.find(ms => ms.value === status);
    setActionData(prev => ({
      ...prev,
      meeting_status: status,
      notes: selectedStatus ? selectedStatus.label : prev.notes
    }));
  };

  const handleAddGeneralRow = () => {
    setActionData(prev => ({
      ...prev,
      reservationGeneralItems: [...prev.reservationGeneralItems, { category: '', item: '', quantity: 1, price: 0, addon_ids: [], discount_type: 'value', discount_value: '' }]
    }));
  };

  const handleRemoveGeneralRow = (index) => {
    if (actionData.reservationGeneralItems.length > 1) {
      setActionData(prev => ({
        ...prev,
        reservationGeneralItems: prev.reservationGeneralItems.filter((_, i) => i !== index)
      }));
    }
  };

  const getItemAvailableQty = (item) => Math.max(0, Number(item?.available_quantity ?? item?.quantity ?? 0) || 0);

  const remainingAvailableForRow = (row, index, rows = actionData.reservationGeneralItems) => {
    const selected = items.find(opt => String(opt.id) === String(row?.item));
    if (!selected) return 0;
    if (isServiceCatalogItem(selected) || isServiceReservationRow(row)) return 1;
    const usedElsewhere = (rows || []).reduce((sum, r, i) => {
      if (i === index) return sum;
      if (String(r.item) !== String(row.item)) return sum;
      return sum + Math.max(0, Number(r.quantity || 0) || 0);
    }, 0);
    return Math.max(0, getItemAvailableQty(selected) - usedElsewhere);
  };

  const handleGeneralRowChange = (index, field, value) => {
    setActionData(prev => {
      const newItems = [...prev.reservationGeneralItems];
      newItems[index] = { ...newItems[index], [field]: value };

      if (field === 'category') {
        const selectedItem = items.find(opt => String(opt.id) === String(newItems[index].item));
        if (selectedItem && value) {
          const catName = categories.find(c => String(c.id) === String(value))?.name;
          const matches = String(selectedItem.category_id) === String(value) || (catName && selectedItem.category === catName);
          if (!matches) {
            newItems[index].item = '';
            newItems[index].addon_ids = [];
            newItems[index].billing_type = '';
          }
        }
      }

      if (field === 'item') {
        const selectedItem = items.find(opt => String(opt.id) === String(value));
        const service = isServiceCatalogItem(selectedItem);
        if (value && !service) {
          const remaining = remainingAvailableForRow({ ...newItems[index], item: value }, index, prev.reservationGeneralItems);
          if (remaining < 1) {
            return prev;
          }
        }
        if (selectedItem) {
          newItems[index].price = selectedItem.service_amount ?? selectedItem.catalog_amount ?? selectedItem.price;
          newItems[index].billing_type = selectedItem.billing_cycle || selectedItem.billingCycle || '';
          newItems[index].business_type = service ? 'service' : 'product';
        } else {
          newItems[index].billing_type = '';
          newItems[index].business_type = '';
        }
        newItems[index].addon_ids = [];
        if (service) {
          newItems[index].quantity = 1;
        } else {
          const remaining = remainingAvailableForRow(newItems[index], index, newItems);
          const currentQty = Math.max(1, Number(newItems[index].quantity || 1) || 1);
          newItems[index].quantity = remaining > 0 ? Math.min(currentQty, remaining) : 0;
        }
      }

      if (field === 'quantity') {
        if (isServiceReservationRow(newItems[index])) {
          newItems[index].quantity = 1;
        } else {
          const remaining = remainingAvailableForRow(newItems[index], index, newItems);
          const nextQty = Math.max(0, Number(value || 0) || 0);
          newItems[index].quantity = remaining > 0 ? Math.min(nextQty, remaining) : 0;
        }
      }

      return { ...prev, reservationGeneralItems: newItems };
    });
  };

  const getGeneralRowTotals = (row) => {
    const service = isServiceReservationRow(row);
    const quantity = service ? 1 : Number(row?.quantity || 0);
    const price = Number(row?.price || 0);
    const baseAmount = (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(price) ? price : 0);
    const addonsAmount = getRowSelectedAddons(row).reduce((sum, addon) => sum + getAddonAmount(addon, service), 0);
    const subTotal = baseAmount + addonsAmount;

    const discountType = row?.discount_type || 'value';
    const rawDiscount = Number(row?.discount_value || 0);
    const discountValue = Number.isFinite(rawDiscount) ? rawDiscount : 0;

    const discountAmount = discountType === 'percent'
      ? (subTotal * clamp(discountValue, 0, 100)) / 100
      : clamp(discountValue, 0, subTotal);

    const total = Math.max(0, subTotal - discountAmount);
    return { baseAmount, addonsAmount, subTotal, discountAmount, total };
  };

  const handleUnitChange = (e) => {
    const unitId = e.target.value;
    const selectedUnit = units.find(u => u.id == unitId);

    setActionData(prev => ({
      ...prev,
      rentUnit: unitId,
      rentAmount: selectedUnit ? selectedUnit.rent_amount : prev.rentAmount
    }));
  };

  const resetReservationFields = () => {
    setActionData(prev => ({
      ...prev,
      reservationType: defaultReservationType,
      reservationCategory: '',
      reservationItem: '',
      reservationGeneralItems: [{ category: '', item: '', quantity: 1, price: 0, addon_ids: [], discount_type: 'value', discount_value: '' }],
      reservationNotes: '',
      reservationProject: '',
      reservationUnit: '',
      reservationAmount: '',
      sourceReservationActionId: '',
      sourceReservationLoadedAt: '',
    }));
  };

  const applyReservationSnapshot = (snapshot = {}) => {
    const nextType = snapshot?.reservationType === 'general' ? 'general' : 'project';
    const rawRows = Array.isArray(snapshot?.reservationGeneralItems) ? snapshot.reservationGeneralItems : [];
    const normalizedRows = rawRows.length > 0
      ? rawRows.map((row) => ({
        category: row?.category ?? row?.category_id ?? '',
        item: row?.item ?? row?.item_id ?? '',
        quantity: row?.quantity ?? 1,
        price: row?.price ?? 0,
        addon_ids: getRowAddonIds(row),
        discount_type: row?.discount_type || 'value',
        discount_value: row?.discount_value ?? '',
        billing_type: row?.billing_type || row?.billingCycle || '',
        business_type: row?.business_type || row?.item_type || '',
      }))
      : [{ category: '', item: '', quantity: 1, price: 0, addon_ids: [], discount_type: 'value', discount_value: '' }];

    const snapshotAmount = snapshot?.reservationAmount ?? snapshot?.reservation_amount ?? snapshot?.amount ?? '';

    setActionData(prev => ({
      ...prev,
      reservationType: nextType,
      reservationCategory: snapshot?.reservationCategory ?? '',
      reservationItem: snapshot?.reservationItem ?? '',
      reservationGeneralItems: nextType === 'general' ? normalizedRows : prev.reservationGeneralItems,
      reservationNotes: snapshot?.reservationNotes ?? '',
      reservationProject: snapshot?.reservationProject ?? snapshot?.reservation_project ?? '',
      reservationUnit: snapshot?.reservationUnit ?? snapshot?.reservation_unit ?? '',
      reservationAmount: snapshotAmount,
      closingRevenue: isClosingDealAction(prev.nextAction) && nextType === 'general'
        ? (snapshotAmount || prev.closingRevenue || '')
        : prev.closingRevenue,
      sourceReservationActionId: snapshot?.sourceReservationActionId ? String(snapshot.sourceReservationActionId) : '',
      sourceReservationLoadedAt: new Date().toISOString(),
    }));
  };

  const loadLatestReservationSnapshot = async () => {
    setIsLoadingReservationSnapshot(true);
    try {
      const response = await api.get('/api/lead-actions', {
        params: { lead_id: lead.id, limit: 500 }
      });
      const records = Array.isArray(response?.data) ? response.data : (response?.data?.data || []);
      const latestReservation = records.find((action) => {
        const actionType = String(action?.action_type || action?.type || '').trim().toLowerCase();
        const nextActionType = String(action?.next_action_type || action?.nextAction || '').trim().toLowerCase();
        const details = action?.details && typeof action.details === 'object' ? action.details : {};
        return (actionType === 'reservation' || nextActionType === 'reservation')
          && (
            details.reservationType
            || details.reservationProject
            || details.reservationUnit
            || (Array.isArray(details.reservationGeneralItems) && details.reservationGeneralItems.length > 0)
          );
      });

      if (!latestReservation) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: {
            type: 'info',
            message: isArabic ? 'لا يوجد حجز سابق يمكن تحميله' : 'No previous reservation found to load'
          }
        }));
        return;
      }

      const details = latestReservation.details && typeof latestReservation.details === 'object'
        ? latestReservation.details
        : {};

      applyReservationSnapshot({
        ...details,
        sourceReservationActionId: latestReservation.id,
      });
    } catch (error) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'error',
          message: isArabic ? 'تعذر تحميل بيانات آخر حجز' : 'Failed to load latest reservation'
        }
      }));
    } finally {
      setIsLoadingReservationSnapshot(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!isClosingDealAction(actionData.nextAction)) return;
    if (isLoadingReservationSnapshot) return;
    if (actionData.sourceReservationLoadedAt || actionData.sourceReservationActionId) return;

    const hasManualReservationData =
      String(actionData.reservationProject || '').trim() !== ''
      || String(actionData.reservationUnit || '').trim() !== ''
      || String(actionData.reservationAmount || '').trim() !== ''
      || String(actionData.reservationNotes || '').trim() !== ''
      || (Array.isArray(actionData.reservationGeneralItems)
        && actionData.reservationGeneralItems.some((row) =>
          String(row?.category || '').trim() !== ''
          || String(row?.item || '').trim() !== ''
          || Number(row?.price || 0) > 0
          || Number(row?.quantity || 0) > 1
          || String(row?.discount_value || '').trim() !== ''
        ));

    if (hasManualReservationData) return;

    loadLatestReservationSnapshot();
  }, [
    actionData.nextAction,
    actionData.reservationAmount,
    actionData.reservationGeneralItems,
    actionData.reservationNotes,
    actionData.reservationProject,
    actionData.reservationUnit,
    actionData.sourceReservationActionId,
    actionData.sourceReservationLoadedAt,
    isLoadingReservationSnapshot,
    isOpen,
  ]);

  const handleQuickTimeSelect = (option) => {
    const now = new Date();
    const newDate = new Date();
    let newTime = now.toTimeString().slice(0, 5);

    if (option === 'after_1_hour') {
      newDate.setHours(now.getHours() + 1);
      newTime = newDate.toTimeString().slice(0, 5);
    } else if (option === 'after_2_hours') {
      newDate.setHours(now.getHours() + 2);
      newTime = newDate.toTimeString().slice(0, 5);
    } else if (option === 'tomorrow') {
      newDate.setDate(now.getDate() + 1);
      newDate.setHours(9, 0, 0, 0); // Default to 9 AM
      newTime = '09:00';
    } else if (option === 'next_week') {
      newDate.setDate(now.getDate() + 7);
      newDate.setHours(9, 0, 0, 0);
      newTime = '09:00';
    }

    setActionData(prev => ({
      ...prev,
      date: newDate.toISOString().split('T')[0],
      time: newTime,
      selectedQuickOption: option
    }));
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked, files } = e.target;

    if (name === 'cancelReason') {
      const selectedOption = e.target.selectedOptions?.[0];
      const selectedId = selectedOption?.dataset?.reasonId || '';
      const selectedText = selectedOption?.dataset?.reasonLabel || value;
      const selectedTextAr = selectedOption?.dataset?.reasonTitleAr || '';
      setActionData(prev => {
        const newReason = selectedText;
        const prevNotes = String(prev.notes || '');
        const lastAuto = String(cancelAutoNotesRef.current || '');
        const shouldAutoFillNotes =
          prev.nextAction === 'cancel' &&
          !cancelNotesTouchedRef.current &&
          (prevNotes.trim() === '' || prevNotes === lastAuto);

        if (shouldAutoFillNotes) {
          cancelAutoNotesRef.current = newReason;
        }

        return {
          ...prev,
          cancelReason: newReason,
          cancelReasonId: selectedId,
          cancelReasonTitleAr: selectedTextAr,
          notes: shouldAutoFillNotes ? newReason : prev.notes,
        };
      });
      return;
    }

    if (name === 'notInterestReason') {
      const selectedOption = e.target.selectedOptions?.[0];
      const selectedId = selectedOption?.dataset?.reasonId || '';
      const selectedText = selectedOption?.dataset?.reasonLabel || value;
      const selectedTextAr = selectedOption?.dataset?.reasonTitleAr || '';
      setActionData(prev => {
        const newReason = selectedText;
        const prevNotes = String(prev.notes || '');
        const lastAuto = String(notInterestAutoNotesRef.current || '');
        const shouldAutoFillNotes =
          prev.nextAction === 'not_interested' &&
          !notInterestNotesTouchedRef.current &&
          (prevNotes.trim() === '' || prevNotes === lastAuto);

        if (shouldAutoFillNotes) {
          notInterestAutoNotesRef.current = newReason;
        }

        return {
          ...prev,
          notInterestReason: newReason,
          notInterestReasonId: selectedId,
          notInterestReasonTitleAr: selectedTextAr,
          notes: shouldAutoFillNotes ? newReason : prev.notes,
        };
      });
      return;
    }

    if (name === 'notes') {
      setActionData(prev => {
        if (prev.nextAction === 'cancel') {
          const lastAuto = String(cancelAutoNotesRef.current || '');
          if (String(value || '').trim() !== '' && String(value) !== lastAuto) {
            cancelNotesTouchedRef.current = true;
          }
        }
        if (prev.nextAction === 'not_interested') {
          const lastAuto = String(notInterestAutoNotesRef.current || '');
          if (String(value || '').trim() !== '' && String(value) !== lastAuto) {
            notInterestNotesTouchedRef.current = true;
          }
        }
        return {
          ...prev,
          [name]: value,
          ...(name === 'actionType' ? { type: value } : {}),
        };
      });
      return;
    }

    if (name === 'stage_id') {
      setActionData(prev => ({
        ...prev,
        stage_id: value
      }));
      return;
    }

    setActionData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'file' ? files[0] : value),
      ...(name === 'actionType' ? { type: value } : {})
    }));
  };

  const handleStageChange = (e) => {
    const stageId = e.target.value;
    const stage = stages.find(s => s.id == stageId);

    if (stage) {
      const uiBehavior = getStageUiBehavior(stage);

      setActionData(prev => ({
        ...prev,
        stage_id: stageId,
        nextAction: stage.type,
        actionType: uiBehavior.default_action_type,
        type: uiBehavior.default_action_type,
        status: uiBehavior.is_terminal ? 'completed' : 'pending',
        selectedQuickOption: uiBehavior.requires_schedule ? prev.selectedQuickOption : null,
        ...(uiBehavior.auto_answer_status ? { answerStatus: uiBehavior.auto_answer_status } : {})
      }));
    } else {
      setActionData(prev => ({
        ...prev,
        stage_id: '',
        nextAction: 'follow_up',
        status: 'pending'
      }));
    }
  };

  const buildCancelDescription = (reason, notes) => {
    const r = String(reason || '').trim();
    const n = String(notes || '').trim();
    if (!r) return n;
    if (!n) return r;
    if (n === r) return r;
    const nLower = n.toLowerCase();
    const rLower = r.toLowerCase();
    if (nLower.startsWith(rLower) || nLower.includes(rLower)) return n;
    return `${r} - ${n}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canAddAction) {
      alert(isArabic ? 'غير مسموح لك بإضافة إجراء لهذا العميل' : 'You are not authorized to add actions to this lead');
      return;
    }

    // Clean up data based on reservation type to avoid confusion
    const cleanedData = { ...actionData };
    if (isReservationAction(cleanedData.nextAction) || isClosingDealAction(cleanedData.nextAction)) {
      if (cleanedData.reservationType === 'general') {
        // If General, remove Project/Unit fields
        cleanedData.reservationProject = '';
        cleanedData.reservationUnit = '';
        const needed = {};
        for (const row of cleanedData.reservationGeneralItems || []) {
          const itemId = String(row?.item ?? row?.item_id ?? '');
          const selected = items.find((i) => String(i.id) === String(itemId));
          const service = isServiceCatalogItem(selected) || isServiceReservationRow(row);
          const qty = service ? 1 : Math.max(0, Number(row?.quantity || 0) || 0);
          if (!itemId) continue;
          if (!service && qty < 1) {
            alert(
              isArabic
                ? `لا يمكن حجز ${selected?.name || itemId} لأن الكمية المتاحة صفر`
                : `${selected?.name || itemId} cannot be reserved because available quantity is 0`
            );
            return;
          }
          if (!service) {
            needed[itemId] = (needed[itemId] || 0) + qty;
          }
        }
        for (const [itemId, qty] of Object.entries(needed)) {
          const selected = items.find((i) => String(i.id) === String(itemId));
          const available = getItemAvailableQty(selected);
          if (qty > available) {
            alert(
              isArabic
                ? `الكمية المتاحة للصنف ${selected?.name || itemId} هي ${available} فقط`
                : `${selected?.name || itemId} has only ${available} available`
            );
            return;
          }
        }
        cleanedData.reservationGeneralItems = (cleanedData.reservationGeneralItems || []).map((row) => {
          const categoryId = row?.category ?? row?.category_id ?? '';
          const itemId = row?.item ?? row?.item_id ?? '';
          const selectedItem = items.find((i) => String(i.id) === String(itemId));
          const service = isServiceCatalogItem(selectedItem) || isServiceReservationRow(row);
          const categoryName =
            row?.category_name ||
            categories.find((c) => String(c.id) === String(categoryId))?.name ||
            '';
          const itemName =
            row?.item_name ||
            selectedItem?.name ||
            '';
          const selectedAddons = getRowSelectedAddons(row).map((addon) => ({
            id: addon.id,
            name: addon.name || '',
            quantity: service ? 1 : Number(addon.quantity || 0),
            price: Number(addon.price || 0),
            period: addon.period || '',
            total: getAddonAmount(addon, service),
          }));
          const { addonsAmount, subTotal, discountAmount, total } = getGeneralRowTotals(row);
          return {
            ...row,
            category: categoryId,
            item: itemId,
            category_name: categoryName,
            item_name: itemName,
            quantity: service ? 1 : row.quantity,
            business_type: service ? 'service' : 'product',
            item_type: service ? 'service' : 'product',
            billing_type: service ? (row.billing_type || selectedItem?.billing_cycle || selectedItem?.billingCycle || '') : undefined,
            addon_ids: getRowAddonIds(row),
            addons: selectedAddons,
            addons_total: addonsAmount,
            sub_total: subTotal,
            discount_amount: discountAmount,
            line_total: total,
          };
        });
      } else {
        // If Project (default), remove General fields
        cleanedData.reservationCategory = '';
        cleanedData.reservationItem = '';
        cleanedData.reservationType = 'project'; // Ensure type is explicit
        const selectedUnit = units.find((unit) => String(unit.id) === String(cleanedData.reservationUnit));
        const unitLabel = String(selectedUnit?.name || '').trim();
        if (unitLabel) {
          cleanedData.unit = unitLabel;
          cleanedData.unit_number = unitLabel;
          cleanedData.unit_code = unitLabel;
        }
        if (selectedUnit?.id) {
          cleanedData.property_id = selectedUnit.id;
        }
      }
    }

    if (isClosingDealAction(cleanedData.nextAction)) {
      let syncedRevenue = String(cleanedData.closingRevenue ?? '').trim();
      if (syncedRevenue === '') {
        if (cleanedData.reservationType === 'general') {
          syncedRevenue = String(cleanedData.reservationAmount ?? '').trim();
        } else {
          const selectedUnit = units.find((unit) => String(unit.id) === String(cleanedData.reservationUnit));
          syncedRevenue = String(selectedUnit?.price || getUnitSellingPrice(selectedUnit) || '').trim();
        }
      }
      cleanedData.closingRevenue = syncedRevenue;
      cleanedData.revenue = syncedRevenue;
    }

    // Helper to convert file to base64
    const fileToBase64 = (file, customName) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve({
          name: customName || file.name,
          type: file.type,
          size: file.size,
          data: reader.result
        });
        reader.onerror = error => reject(error);
      });
    };

    const toast = (type, message) => {
      try {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message } }));
      } catch {
        alert(message);
      }
    };

    setIsSubmitting(true);

    try {
      // Handle file attachments if any
      const stageName = selectedStage ? (selectedStage.name_en || selectedStage.name || 'Stage') : 'General';
      const tenantName = company?.name || 'Tenant';
      
      if (cleanedData.proposalAttachment instanceof File) {
        const file = cleanedData.proposalAttachment;
        if (file.size > 5 * 1024 * 1024) {
          toast('error', isArabic ? 'حجم المرفق كبير جدًا (الحد الأقصى 5MB).' : 'Attachment is too large (max 5MB).');
          return;
        }
        const extension = file.name.split('.').pop();
        const customName = `${stageName}_${tenantName}.${extension}`;
        cleanedData.proposalAttachment = await fileToBase64(file, customName);
      }
      if (cleanedData.rentAttachment instanceof File) {
        const file = cleanedData.rentAttachment;
        if (file.size > 5 * 1024 * 1024) {
          toast('error', isArabic ? 'حجم المرفق كبير جدًا (الحد الأقصى 5MB).' : 'Attachment is too large (max 5MB).');
          return;
        }
        const extension = file.name.split('.').pop();
        const customName = `${stageName}_${tenantName}.${extension}`;
        cleanedData.rentAttachment = await fileToBase64(file, customName);
      }

      if (cleanedData.nextAction === 'cancel' && !String(cleanedData.cancelReason || '').trim()) {
        toast('error', isArabic ? 'من فضلك اختر سبب الإلغاء' : 'Please select a cancel reason');
        return;
      }

      if (cleanedData.nextAction === 'not_interested' && !String(cleanedData.notInterestReason || '').trim()) {
        toast('error', isArabic ? 'من فضلك اختر سبب عدم الاهتمام' : 'Please select a not interest reason');
        return;
      }

      // For cancel actions, store the cancel reason as a comment (audit trail) instead of forcing it into notes/description.
      if (cleanedData.nextAction === 'cancel') {
        const reason = String(cleanedData.cancelReason || '').trim();
        if (reason) {
          cleanedData.type = cleanedData.type || 'cancel';
          cleanedData.actionType = cleanedData.actionType || 'cancel';
          cleanedData.comments = [
            {
              text: reason,
              reasonId: cleanedData.cancelReasonId ? Number(cleanedData.cancelReasonId) : undefined,
              cancelReasonId: cleanedData.cancelReasonId ? Number(cleanedData.cancelReasonId) : undefined,
              reasonTitle: reason,
              reasonTitleAr: cleanedData.cancelReasonTitleAr || '',
              userId: user?.id,
              userName: user?.name,
              createdAt: new Date().toISOString(),
              kind: 'cancel_reason',
            },
          ];
        }
      }

      if (cleanedData.nextAction === 'not_interested') {
        const reason = String(cleanedData.notInterestReason || '').trim();
        if (reason) {
          cleanedData.comments = [
            {
              text: reason,
              reasonId: cleanedData.notInterestReasonId ? Number(cleanedData.notInterestReasonId) : undefined,
              notInterestReasonId: cleanedData.notInterestReasonId ? Number(cleanedData.notInterestReasonId) : undefined,
              reasonTitle: reason,
              reasonTitleAr: cleanedData.notInterestReasonTitleAr || '',
              userId: user?.id,
              userName: user?.name,
              createdAt: new Date().toISOString(),
              kind: 'not_interest_reason',
            },
          ];
        }
      }

      const isTerminalNextAction = isClosingDealAction(cleanedData.nextAction) || ['cancel', 'not_interested'].includes(String(cleanedData.nextAction || '').trim());
      if (isTerminalNextAction) {
        cleanedData.date = '';
        cleanedData.time = '';
        cleanedData.next_action_date = '';
        cleanedData.next_action_time = '';
        cleanedData.nextActionDate = '';
        cleanedData.nextActionTime = '';
      }

      if (isTelesalesWorkflowLead && isTransferStageSelected) {
        if (!transferSelectedUser?.id) {
          toast('error', isArabic ? 'من فضلك اختر عضو السيلز' : 'Please select a sales assignee');
          return;
        }

        const transferPayload = buildLeadTransferPayload({
          userId: transferSelectedUser.id,
          assignRole: transferAssignRole,
          method: transferMethod === 'cold_call' ? 'cold_call' : 'fresh',
          options: {},
        });

        const transferResponse = await api.post(`/api/telesales/leads/${lead.id}/transfer-to-sales`, {
          assignment_method: 'direct',
          assigned_to: Number(transferSelectedUser.id),
          assign_role: transferAssignRole,
          stage: transferPayload.stage,
          history_option: transferPayload.history_option,
          options: {},
        });

        if (onSave) {
          onSave(transferResponse?.data?.lead || transferResponse?.data);
        }
        onClose();
        return;
      }

      // Construct description from various sources
      let finalDescription = cleanedData.notes || cleanedData.description || cleanedData.title || '';
      if (cleanedData.reservationNotes) {
        finalDescription = finalDescription ? `${finalDescription} - ${cleanedData.reservationNotes}` : cleanedData.reservationNotes;
      }

      if (cleanedData.nextAction === 'cancel') {
        finalDescription = buildCancelDescription(cleanedData.cancelReason, finalDescription);
      }
      if (cleanedData.nextAction === 'not_interested') {
        finalDescription = buildCancelDescription(cleanedData.notInterestReason, finalDescription);
      }

      const payload = {
        lead_id: lead.id,
        type: cleanedData.type || 'comment',
        status: cleanedData.status,
        date: isTerminalNextAction ? null : cleanedData.date,
        time: isTerminalNextAction ? null : cleanedData.time,
        description: finalDescription, // Use constructed description
        outcome: cleanedData.answerStatus, // Map answerStatus to outcome
        stage_id: cleanedData.stage_id,
        next_action_type: cleanedData.nextAction,
        // Include all other data in the payload for the JSON column
        ...cleanedData
      };

      const response = await api.post('/api/lead-actions', payload);

      if (cleanedData.stage_id) {
        const tenantId = company?.id || company?.tenant_id || company?.tenantId;
        setLastActionStageId({ userId: user?.id, tenantId, stageId: cleanedData.stage_id });
      }

      if (onSave) {
        onSave(response.data.action);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save action:', error);
      let msg =
        error?.response?.data?.message ||
        (error?.response?.data?.errors ? JSON.stringify(error.response.data.errors) : null) ||
        (isArabic ? 'فشل حفظ الأكشن' : 'Failed to save action');

      // Make common meeting errors clearer to users
      const rawMsg = String(msg || '').toLowerCase();
      if (rawMsg.includes('only the lead owner')) {
        msg = isArabic
          ? 'مسموح فقط لصاحب الليد بتنفيذ الأكشن. لو محتاج، قم بإسناد الليد لك أولًا.'
          : 'Only the lead owner can perform this action. Assign the lead to yourself first if needed.';
      }
      toast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (actionData.nextAction !== 'cancel') {
      cancelNotesTouchedRef.current = false;
      cancelAutoNotesRef.current = '';
      return;
    }

    const reason = String(actionData.cancelReason || '').trim();
    const notes = String(actionData.notes || '').trim();
    if (!reason) return;
    if (cancelNotesTouchedRef.current) return;
    if (notes !== '') return;

    cancelAutoNotesRef.current = reason;
    setActionData(prev => ({ ...prev, notes: reason }));
  }, [actionData.nextAction, actionData.cancelReason]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (actionData.nextAction !== 'not_interested') {
      notInterestNotesTouchedRef.current = false;
      notInterestAutoNotesRef.current = '';
      return;
    }

    const reason = String(actionData.notInterestReason || '').trim();
    const notes = String(actionData.notes || '').trim();
    if (!reason) return;
    if (notInterestNotesTouchedRef.current) return;
    if (notes !== '') return;

    notInterestAutoNotesRef.current = reason;
    setActionData(prev => ({ ...prev, notes: reason }));
  }, [actionData.nextAction, actionData.notInterestReason]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedActionType = actionTypes.find(type => type.value === actionData.type);
  const ActionIcon = selectedActionType?.icon || FaComments;

  // Wrapper classes for overlay vs inline modes
  const overlayWrapper = inline
    ? 'relative p-0'
    : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-0 sm:p-6';
  const containerClasses = inline
    ? `${isLight ? 'bg-white text-slate-800' : 'bg-gray-800 text-white'} sm:rounded-lg shadow-xl w-full h-auto`
    : `${isLight ? 'bg-white text-slate-800' : 'bg-gray-800 text-white'} sm:rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[85vh] h-auto overflow-y-auto m-0 sm:m-4`;

  useEffect(() => {
    if (!inline && isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return () => { document.body.style.overflow = prev; };
    }
  }, [inline, isOpen]);

  const isMeetingAction =
    actionData.nextAction === 'meeting' ||
    actionData.actionType === 'meeting' ||
    actionData.actionType === 'google_meet';

  const submitButtonLabel = isSubmitting
    ? (isArabic ? 'جاري التنفيذ...' : 'Processing...')
    : (isTransferStageSelected
      ? (isArabic ? 'تحويل' : 'Convert')
      : (isArabic ? 'حفظ الأكشن' : 'Save Action'));

  const content = (
    <div className={overlayWrapper}>
      <div className={containerClasses}>
        {/* Header */}
        <div className={`flex items-center justify-between p-8 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
          <div className="flex items-center gap-3">
            <h2 className={`text-xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {isArabic ? 'إضافة أكشن' : 'Add Action'}
            </h2>
          </div>
          {!inline && (
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="btn btn-sm btn-circle btn-ghost text-red-500"
              >
                <FaTimes size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Subtitle */}
        <div className="px-8 pt-6">
          <p className={`${isLight ? 'text-slate-600' : 'text-gray-400'} text-sm`}>
            {isArabic
              ? (actionData.nextAction === 'meeting' ? 'اختر تفاصيل الاجتماع' : 'اختر نوع الأكشن وحدد التفاصيل')
              : (actionData.nextAction === 'meeting' ? 'Choose meeting details' : 'Select action type and schedule details')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {!canAddAction ? (
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-center">
              <FaTimes className="mx-auto text-red-500 mb-3 text-2xl" />
              <p className="text-red-600 dark:text-red-400 font-medium">
                {isArabic ? 'غير مسموح لك بإضافة إجراء لهذا العميل حسب الصلاحيات الحالية.' : 'You are not authorized to add actions to this lead under the current permissions.'}
              </p>
            </div>
          ) : (
            <>
              {/* Stage / Next Action Selection - Only for Lead Owner or Super Admin */}
              {canAddAction && (
                <div>
                  <label className={`block text-sm font-medium mb-3 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                    {isArabic ? 'المرحلة / الإجراء' : 'Stage / Action'}
                  </label>
                  <div className="relative">
                    <select
                      name="stage_id"
                      value={actionData.stage_id || ''}
                      onChange={handleStageChange}
                      className={`${isLight ? `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                    >
                      <option value="">{isArabic ? 'اختر المرحلة' : 'Select Stage'}</option>
                      {selectableStages.map(stage => (
                        <option key={stage.id} value={stage.id}>
                          {stageLabel(stage)}
                        </option>
                      ))}
                    </select>
                    <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                  </div>
                </div>
              )}

              {isTelesalesWorkflowLead && isTransferStageSelected ? (
                <div className={`space-y-5 rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-transparent' : 'border-slate-700/70 bg-slate-900/10'}`}>
                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                        {isArabic ? 'تصفية حسب دور السيلز' : 'Filter By Sales Role'}
                      </label>
                      <select
                        value={transferFilterRole}
                        onChange={(e) => setTransferFilterRole(e.target.value)}
                        className={`${isLight ? 'w-full rounded-md border border-gray-300 bg-white text-slate-900' : 'w-full rounded-md border border-gray-600 bg-gray-700 text-white'} px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        {transferRoleOptions.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                        {isArabic ? 'تحويل إلى' : 'Assign To'}
                      </label>
                      <input
                        type="text"
                        value={transferSearchQuery}
                        onChange={(e) => setTransferSearchQuery(e.target.value)}
                        placeholder={isArabic ? 'ابحث في أعضاء فريق السيلز' : 'Search sales team members'}
                        className={`${isLight ? 'w-full rounded-md border border-gray-300 bg-white text-slate-900 placeholder:text-slate-400' : 'w-full rounded-md border border-gray-600 bg-gray-700 text-white placeholder:text-gray-400'} px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                  </div>

                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {filteredSalesAssignees.length > 0 ? filteredSalesAssignees.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setTransferSelectedUser(entry)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${transferSelectedUser?.id === entry.id
                          ? (isLight ? 'border-blue-500 bg-blue-50' : 'border-blue-500 bg-blue-900/20')
                          : (isLight ? 'border-gray-200 hover:bg-gray-50' : 'border-slate-700 hover:bg-slate-800')}`}
                      >
                        <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${transferSelectedUser?.id === entry.id ? 'border-blue-500' : 'border-gray-300'}`}>
                          {transferSelectedUser?.id === entry.id && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{entry.name}</p>
                          <p className={`truncate text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{entry.role || entry.job_title || '-'}</p>
                        </div>
                      </button>
                    )) : (
                      <div className={`rounded-xl border px-4 py-6 text-center text-sm ${isLight ? 'border-gray-200 text-slate-500' : 'border-slate-700 text-slate-400'}`}>
                        {isArabic ? 'لا يوجد أعضاء متاحون' : 'No members found'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                      {isArabic ? 'ابدأ في السيلز كـ' : 'Start In Sales As'}
                    </label>
                    <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                      <button
                        type="button"
                        onClick={() => setTransferMethod('fresh')}
                        className={`rounded-lg py-2 text-sm transition-all ${transferMethod === 'fresh' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {isArabic ? 'جديد' : 'New'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTransferMethod('cold_call')}
                        className={`rounded-lg py-2 text-sm transition-all ${transferMethod === 'cold_call' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {isArabic ? 'كـ كولد كول' : 'As cold call'}
                      </button>
                    </div>
                  </div>

                  {transferSelectedUser ? (
                    <div>
                      <label className={`mb-2 block text-sm font-medium ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                        {isArabic ? 'دور التعيين' : 'Assignment Role'}
                      </label>
                      {canAssignTransferAsManager ? (
                        <div className={`grid grid-cols-2 rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                          <button
                            type="button"
                            onClick={() => setTransferAssignRole('sales')}
                            className={`rounded-lg py-2 text-sm transition-all ${transferAssignRole === 'sales' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            {isArabic ? 'كسيلز' : 'As Sales'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferAssignRole('manager')}
                            className={`rounded-lg py-2 text-sm transition-all ${transferAssignRole === 'manager' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            {isArabic ? 'كمدير' : 'As Manager'}
                          </button>
                        </div>
                      ) : (
                        <div className={`rounded-xl border p-1 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800'}`}>
                          <button
                            type="button"
                            className="w-full rounded-lg bg-white py-2 text-sm text-slate-900 shadow-sm"
                          >
                            {isArabic ? 'كسيلز' : 'As Sales'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : ['follow_up'].includes(actionData.nextAction) && (
                <div className={`grid ${['call', 'email'].includes(actionData.actionType) ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  <div>
                    <label className={`block text-sm font-medium mb-3 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                      {isArabic ? 'نوع الأكشن' : 'Action Type'}
                    </label>
                    <div className="relative">
                      <select
                        name="actionType"
                        value={actionData.actionType}
                        onChange={handleInputChange}
                        className={`${isLight ? `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                      >
                        {filteredActionTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                    </div>
                  </div>

                  {/* Sub Type Selection for Call/Email */}
                  {actionData.actionType === 'call' && (
                    <div>
                      <label className={`block text-sm font-medium mb-3 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                        {isArabic ? 'نوع المكالمة' : 'Call Type'}
                      </label>
                      <div className="relative">
                        <select
                          name="subType"
                          value={actionData.subType || ''}
                          onChange={handleInputChange}
                          className={`${isLight ? `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                        >
                          <option value="">{isArabic ? 'اختر' : 'Select'}</option>
                          {callSubTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                        <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                      </div>
                    </div>
                  )}

                  {actionData.actionType === 'email' && (
                    <div>
                      <label className={`block text-sm font-medium mb-3 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                        {isArabic ? 'نوع البريد' : 'Email Type'}
                      </label>
                      <div className="relative">
                        <select
                          name="subType"
                          value={actionData.subType || ''}
                          onChange={handleInputChange}
                          className={`${isLight ? `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                        >
                          <option value="">{isArabic ? 'اختر' : 'Select'}</option>
                          {emailSubTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                        <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Answer Status Toggle */}
          {!isTransferStageSelected && actionData.type && selectedStageBehavior.requires_answer_toggle && (
            <div className={`flex items-center gap-4 ${isArabic ? 'justify-between' : 'justify-between'}`}>
              <button
                type="button"
                onClick={() => setActionData(prev => ({
                  ...prev,
                  answerStatus: prev.answerStatus === 'answer' ? 'no_answer' : 'answer',
                  notes: prev.answerStatus === 'answer'
                    ? 'no answer'
                    : (prev.notes === 'no answer' ? '' : prev.notes)
                }))}
                className={`flex items-center gap-3 px-6 py-4 rounded-xl transition-all font-medium backdrop-blur-md border ${
                  actionData.answerStatus === 'answer'
                    ? (isLight
                      ? 'bg-green-50 text-green-700 hover:bg-green-100 border-green-300 shadow-lg shadow-green-200/70'
                      : 'bg-white/10 hover:bg-white/20 text-green-300 hover:text-green-200 shadow-2xl shadow-black/30 hover:shadow-black/50 shadow-green-500/20 border-green-400/40')
                    : (isLight
                      ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300 shadow-lg shadow-red-200/70'
                      : 'bg-white/10 hover:bg-white/20 text-red-300 hover:text-red-200 shadow-2xl shadow-black/30 hover:shadow-black/50 shadow-red-500/20 border-red-400/40')
                }`}
              >
                {actionData.answerStatus === 'answer' ? (
                  <>
                    <FaToggleOn className="text-lg text-green-400" />
                    <span>{isArabic ? 'إجابة' : 'Answer'}</span>
                  </>
                ) : (
                  <>
                    <FaToggleOff className="text-lg text-red-400" />
                    <span>{isArabic ? 'لا يوجد إجابة' : 'No Answer'}</span>
                  </>
                )}
              </button>

              {/* Done Meeting Toggle - REPLACED WITH STATUS DROPDOWN */}
              {isMeetingAction && (
                <div className="flex flex-wrap gap-2">
                  {meetingStatuses.map((ms) => (
                    <button
                      key={ms.value}
                      type="button"
                      onClick={() => handleStatusChange(ms.value)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all border ${
                        actionData.meeting_status === ms.value
                          ? `${ms.color} text-white border-transparent shadow-lg scale-105`
                          : `${isLight ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'}`
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${actionData.meeting_status === ms.value ? 'bg-white' : ms.color}`}></span>
                      {ms.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Warning Message for Missed Meetings */}
          {!isTransferStageSelected && lead?.missed_meetings_count >= 3 && (
            <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm animate-pulse rounded-lg">
              <p className="font-bold">{isArabic ? 'تنبيه: العميل فوت أكثر من اجتماع!' : 'Warning: High No-Show Rate!'}</p>
              <p>{isArabic ? 'هذا العميل فوت 3 اجتماعات أو أكثر. يرجى التأكد من الجدية قبل الجدولة مرة أخرى.' : 'This lead has missed 3 or more meetings. Verify commitment before scheduling again.'}</p>
            </div>
          )}

          {/* Meeting Type and Location */}
          {!isTransferStageSelected && actionData.nextAction === 'meeting' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                  {isArabic ? 'نوع الاجتماع' : 'Meeting Type'}
                </label>
                <div className="relative">
                  <select
                    name="meetingType"
                    value={actionData.meetingType}
                    onChange={handleInputChange}
                    className={`${isLight ? `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                  >
                    {meetingTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                  {isArabic ? 'مكان الاجتماع' : 'Meeting Location'}
                </label>
                <div className="relative">
                  <select
                    name="meetingLocation"
                    value={actionData.meetingLocation}
                    onChange={handleInputChange}
                    className={`${isLight ? `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                  >
                    {meetingLocations.map(location => (
                      <option key={location.value} value={location.value}>
                        {location.label}
                      </option>
                    ))}
                  </select>
                  <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                </div>
              </div>
            </div>
          )}

          {/* Proposal fields */}
          {actionData.nextAction === 'proposal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'قيمة العرض' : 'Proposal Amount'}</label>
                <input name="proposalAmount" type="number" value={actionData.proposalAmount} onChange={handleInputChange} {...numericFieldProps} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'الخصم %' : 'Discount %'}</label>
                <input name="proposalDiscount" type="number" value={actionData.proposalDiscount} onChange={handleInputChange} {...numericFieldProps} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'مدة الصلاحية (أيام)' : 'Validity Days'}</label>
                <input name="proposalValidityDays" type="number" value={actionData.proposalValidityDays} onChange={handleInputChange} {...numericFieldProps} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'مرفق' : 'Attachment'}</label>
                <input name="proposalAttachment" type="file" onChange={handleInputChange} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
            </div>
          )}

          {/* Reservation fields */}
          {showReservationFields && (
            <div className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'النوع' : 'Type'}</label>
                <div className="relative">
                  <select
                    name="reservationType"
                    value={actionData.reservationType}
                    onChange={handleInputChange}
                    disabled
                    className={`${isLight ? `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                  >
                    <option value={defaultReservationType}>{reservationTypeLabel}</option>
                  </select>
                  <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                </div>
              </div>

              {actionData.reservationType === 'project' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'العميل' : 'Customer'}</label>
                    <input type="text" value={lead?.name || ''} disabled className={`${isLight ? 'w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-slate-500' : 'w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-400'}`} />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'المشروع' : 'Project'}</label>
                    <div className="relative">
                      <select
                        name="reservationProject"
                        value={actionData.reservationProject}
                        onChange={(e) => {
                          handleInputChange(e);
                          // Clear unit when project changes
                          setActionData(prev => ({ ...prev, reservationUnit: '', reservationProject: e.target.value }));
                        }}
                        className={`${isLight ? `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                      >
                        <option value="">{isArabic ? 'اختر' : 'Select'}</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                      <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'الوحدة' : 'Unit'}</label>
                    <div className="relative">
                      <select
                        name="reservationUnit"
                        value={actionData.reservationUnit}
                        onChange={handleInputChange}
                        className={`${isLight ? `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                      >
                        <option value="">{isArabic ? 'اختر' : 'Select'}</option>
                        {units
                          .filter(unit => !actionData.reservationProject || unit.project_id == actionData.reservationProject)
                          .map((unit) => (
                            <option key={unit.id} value={unit.id}>{unit.name}</option>
                          ))}
                      </select>
                      <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'قيمة الحجز' : 'Reservation Amount'}</label>
                    <input
                      name="reservationAmount"
                      type="text"
                      value={formatDisplayNumber(actionData.reservationAmount)}
                      onChange={(e) => {
                        const rawValue = parseDisplayNumber(e.target.value);
                        setActionData(prev => ({
                          ...prev,
                          reservationAmount: rawValue,
                        }));
                      }}
                      {...numericFieldProps}
                      className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'العميل' : 'Customer'}</label>
                    <input type="text" value={lead?.name || ''} disabled className={`${isLight ? 'w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-slate-500' : 'w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-400'}`} />
                  </div>

                  {/* Dynamic Rows */}
                  <div>
                    {actionData.reservationGeneralItems.map((row, index) => {
                      const serviceRow = isServiceReservationRow(row);
                      const availableQty = remainingAvailableForRow(row, index);
                      const rowControlClass = isLight
                        ? 'h-10 w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900'
                        : 'h-10 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white';
                      return (
                      <div
                        key={index}
                        className={`flex flex-nowrap items-end gap-2 overflow-x-auto py-3 ${index < actionData.reservationGeneralItems.length - 1 ? (isLight ? 'border-b border-gray-200' : 'border-b border-gray-700') : ''}`}
                      >
                        <div className="min-w-[140px] flex-1">
                          <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'الفئة' : 'Category'}</label>
                          <SearchableSelect
                            options={categories.map((opt) => ({
                              value: String(opt.id),
                              label: `${opt.name} (${categoryTypeLabel(opt)})`,
                            }))}
                            value={row.category ? String(row.category) : ''}
                            onChange={(value) => handleGeneralRowChange(index, 'category', value || '')}
                            placeholder={isArabic ? 'اختر' : 'Select'}
                            isRTL={isRTL}
                            showAllOption={false}
                            className={`${isLight ? 'bg-white border-gray-300 text-slate-900' : 'bg-gray-700 border-gray-600 text-white'} h-10 min-h-10 rounded-md`}
                          />
                        </div>
                        <div className="min-w-[160px] flex-1">
                          <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                            {serviceRow ? (isArabic ? 'الخدمة' : 'Service') : (isArabic ? 'العنصر' : 'Item')}
                          </label>
                          <SearchableSelect
                            options={items
                              .filter(item => {
                                if (!row.category) return true;
                                const catName = categories.find(c => String(c.id) === String(row.category))?.name;
                                return String(item.category_id) === String(row.category) || (catName && item.category === catName);
                              })
                              .map((opt) => {
                                const serviceItem = isServiceCatalogItem(opt);
                                const available = remainingAvailableForRow({ ...row, item: opt.id }, index);
                                return {
                                  value: String(opt.id),
                                  label: serviceItem
                                    ? opt.name
                                    : `${opt.name} (${available} ${isArabic ? 'متاح' : 'avail.'})`,
                                  disabled: serviceItem ? false : available < 1,
                                };
                              })}
                            value={row.item ? String(row.item) : ''}
                            onChange={(value) => handleGeneralRowChange(index, 'item', value || '')}
                            placeholder={isArabic ? 'اختر' : 'Select'}
                            isRTL={isRTL}
                            showAllOption={false}
                            className={`${isLight ? 'bg-white border-gray-300 text-slate-900' : 'bg-gray-700 border-gray-600 text-white'} h-10 min-h-10 rounded-md`}
                          />
                        </div>
                        {serviceRow ? (
                          <div className="w-[120px] shrink-0">
                            <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                              {isArabic ? 'نوع الفوترة' : 'Billing'}
                            </label>
                            <input
                              type="text"
                              value={row.billing_type || items.find((opt) => String(opt.id) === String(row.item))?.billing_cycle || items.find((opt) => String(opt.id) === String(row.item))?.billingCycle || ''}
                              readOnly
                              className={`${isLight ? 'h-10 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-slate-700 cursor-not-allowed' : 'h-10 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-400 cursor-not-allowed'}`}
                            />
                          </div>
                        ) : (
                          <div className="w-[88px] shrink-0">
                            <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>
                              {isArabic ? 'الكمية' : 'Qty'}
                              {row.item ? ` (${availableQty})` : ''}
                            </label>
                            <input
                              type="text"
                              min="1"
                              max={availableQty}
                              value={row.quantity}
                              onChange={(e) => handleGeneralRowChange(index, 'quantity', parseDisplayNumber(e.target.value))}
                              {...numericFieldProps}
                              inputMode="numeric"
                              title={row.item ? `${isArabic ? 'المتاح' : 'Available'}: ${availableQty}` : undefined}
                              className={rowControlClass}
                            />
                          </div>
                        )}
                        <div className="w-[110px] shrink-0">
                          <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'المبلغ' : 'Amount'}</label>
                          <input
                            type="text"
                            value={formatDisplayNumber(row.price)}
                            onChange={(e) => handleGeneralRowChange(index, 'price', parseDisplayNumber(e.target.value))}
                            {...numericFieldProps}
                            className={rowControlClass}
                          />
                        </div>
                        <div className="min-w-[170px] flex-1">
                          <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'الإضافات' : 'Add-ons'}</label>
                          <SearchableSelect
                            options={getItemAddons(row.item).map((addon) => ({
                              value: addon.id,
                              label: serviceRow
                                ? `${addon.name || ''}${addon.period ? ` · ${addon.period}` : ''}${Number(addon.price || 0) ? ` (${formatDisplayNumber(getAddonAmount(addon, true))})` : ''}`
                                : `${addon.name || ''}${Number(addon.price || 0) ? ` (${formatDisplayNumber(getAddonAmount(addon))})` : ''}`,
                            }))}
                            value={getRowAddonIds(row)}
                            onChange={(value) => handleGeneralRowChange(index, 'addon_ids', value)}
                            placeholder={row.item ? (isArabic ? 'اختر الإضافات' : 'Select add-ons') : (isArabic ? 'اختر العنصر أولاً' : 'Select item first')}
                            isRTL={isRTL}
                            multiple
                            showAllOption={false}
                            className={`${isLight ? 'bg-white border-gray-300 text-slate-900' : 'bg-gray-700 border-gray-600 text-white'} h-10 min-h-10 rounded-md`}
                          />
                        </div>
                        <div className="w-[168px] shrink-0">
                          <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'خصم' : 'Discount'}</label>
                          <div className="flex gap-2">
                            <select
                              value={row.discount_type || 'value'}
                              onChange={(e) => handleGeneralRowChange(index, 'discount_type', e.target.value)}
                              className={`${isLight ? 'h-10 w-[84px] appearance-none px-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'h-10 w-[84px] appearance-none px-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`}
                              aria-label={isArabic ? 'النوع' : 'Discount type'}
                            >
                              <option value="value">{isArabic ? 'قيمة' : 'Value'}</option>
                              <option value="percent">{isArabic ? 'نسبة' : '%'}</option>
                            </select>
                            <input
                              type="text"
                              min="0"
                              value={formatDisplayNumber(row.discount_value ?? '')}
                              onChange={(e) => handleGeneralRowChange(index, 'discount_value', parseDisplayNumber(e.target.value))}
                              {...numericFieldProps}
                              className={`${isLight ? 'h-10 flex-1 px-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'h-10 flex-1 px-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`}
                              placeholder={row.discount_type === 'percent' ? '0-100' : '0'}
                            />
                          </div>
                        </div>
                        <div className="w-[110px] shrink-0">
                          <label className={`block text-sm font-medium mb-1 whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'الإجمالي' : 'Sub Total'}</label>
                          <input
                            type="text"
                            value={formatDisplayNumber(getGeneralRowTotals(row).total)}
                            readOnly
                            {...numericFieldProps}
                            className={`${isLight ? 'h-10 w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-slate-700 cursor-not-allowed' : 'h-10 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-400 cursor-not-allowed'}`}
                          />
                        </div>
                        {actionData.reservationGeneralItems.length > 1 && (
                          <button
                            onClick={() => handleRemoveGeneralRow(index)}
                            className="h-10 w-10 shrink-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title={isArabic ? 'حذف' : 'Remove'}
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddGeneralRow}
                      className={`flex items-center gap-2 text-sm font-medium ${isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'}`}
                    >
                      <FaPlus /> {isArabic ? 'إضافة صف آخر' : 'Add another row'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'إجمالي المبلغ' : 'Total Amount'}</label>
                      <input
                        name="reservationAmount"
                        type="text"
                        value={formatDisplayNumber(actionData.reservationAmount)}
                        readOnly
                        {...numericFieldProps}
                        className={`${isLight ? 'w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-slate-700 cursor-not-allowed' : 'w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-400 cursor-not-allowed'}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'ملاحظات' : 'Notes'}</label>
                      <textarea name="reservationNotes" value={actionData.reservationNotes} onChange={handleInputChange} rows="2" className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'} resize-none`} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Closing Deals fields */}
          {isClosingDealAction(actionData.nextAction) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'الإيرادات' : 'Revenue'}</label>
                <input
                  name="closingRevenue"
                  type="text"
                  value={formatDisplayNumber(actionData.closingRevenue)}
                  onChange={(e) => {
                    const rawValue = parseDisplayNumber(e.target.value);
                    setActionData(prev => ({ ...prev, closingRevenue: rawValue }));
                  }}
                  {...numericFieldProps}
                  className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`}
                />
              </div>
            </div>
          )}

          {/* Rent fields */}
          {actionData.nextAction === 'rent' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'الوحدة' : 'Unit'}</label>
                <div className="relative">
                  <select
                    name="rentUnit"
                    value={actionData.rentUnit}
                    onChange={handleUnitChange}
                    className={`${isLight ? 'w-full appearance-none px-3 py-2 pr-10 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900' : 'w-full appearance-none px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white'}`}
                  >
                    <option value="">{isArabic ? 'اختر' : 'Select'}</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                  <FaChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'قيمة الإيجار' : 'Rent Amount'}</label>
                <input name="rentAmount" type="number" value={actionData.rentAmount} onChange={handleInputChange} {...numericFieldProps} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'بداية الإيجار' : 'Rent Start'}</label>
                <input name="rentStart" type="date" value={actionData.rentStart} onChange={handleInputChange} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'نهاية الإيجار' : 'Rent End'}</label>
                <input name="rentEnd" type="date" value={actionData.rentEnd} onChange={handleInputChange} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{isArabic ? 'مرفق' : 'Attachment'}</label>
                <input name="rentAttachment" type="file" onChange={handleInputChange} className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-slate-900' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white'}`} />
              </div>
            </div>
          )}

          {/* Cancel fields */}
          {actionData.nextAction === 'cancel' && (
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'سبب الإلغاء' : 'Cancel Reason'}</label>
              <div className="relative">
                <select
                  name="cancelReason"
                  value={actionData.cancelReasonId || ''}
                  onChange={handleInputChange}
                  className={`${isLight ? `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                >
                  <option value="">{isArabic ? 'اختر السبب' : 'Select Reason'}</option>
                  {cancelReasons.map((r) => (
                    <option
                      key={r.id}
                      value={r.id}
                      data-reason-id={r.id}
                      data-reason-label={isArabic && r.title_ar ? r.title_ar : r.title}
                      data-reason-title-ar={r.title_ar || ''}
                    >
                      {isArabic && r.title_ar ? r.title_ar : r.title}
                    </option>
                  ))}
                </select>
                <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
              </div>
            </div>
          )}

          {actionData.nextAction === 'not_interested' && (
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{isArabic ? 'سبب عدم الاهتمام' : 'Not Interest Reason'}</label>
              <div className="relative">
                <select
                  name="notInterestReason"
                  value={actionData.notInterestReasonId || ''}
                  onChange={handleInputChange}
                  className={`${isLight ? `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900` : `w-full appearance-none px-3 py-2 ${isRTL ? 'pl-10' : 'pr-10'} bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white`}`}
                >
                  <option value="">{isArabic ? 'اختر السبب' : 'Select Reason'}</option>
                  {notInterestReasons.map((r) => (
                    <option
                      key={r.id}
                      value={r.id}
                      data-reason-id={r.id}
                      data-reason-label={isArabic && r.title_ar ? r.title_ar : r.title}
                      data-reason-title-ar={r.title_ar || ''}
                    >
                      {isArabic && r.title_ar ? r.title_ar : r.title}
                    </option>
                  ))}
                </select>
                <FaChevronDown className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-gray-300'} pointer-events-none`} />
              </div>
            </div>
          )}

          {/* Schedule Date */}
          {!isTransferStageSelected && selectedStageBehavior.requires_schedule && (
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {isArabic ? 'تاريخ الجدولة' : 'Schedule Date'}
              </h3>

              {/* Split layout: left input (50%), right buttons (50%) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Left: Date and Time Input with Calendar Icon */}
                <div className="space-y-2">
                  <DatePicker
                     selected={getScheduleDay()}
                     onChange={(d) => {
                       if (!d) return;
                       setScheduleDateOnly(d);
                     }}
                    onClickOutside={handleScheduleClickOutside}
                    onCalendarClose={() => setSchedulePickerOpen(false)}
                    open={schedulePickerOpen}
                    shouldCloseOnSelect={false}
                    closeOnScroll={false}
                    dateFormat={datePickerFormat}
                    popperProps={{ strategy: 'fixed' }}
                    popperModifiers={[
                      offset(8),
                      flip({ padding: 8 }),
                      shift({ padding: 8 }),
                      size({
                        padding: 8,
                        apply({ availableHeight, elements }) {
                          Object.assign(elements.floating.style, {
                            maxHeight: `${availableHeight}px`,
                            overflowY: 'auto',
                          });
                        },
                      }),
                    ]}
                    popperPlacement={isRTL ? 'bottom-end' : 'bottom-start'}
                    popperContainer={SchedulePopperContainer}
                    popperClassName="z-[10050]"
                    calendarContainer={ScheduleCalendarContainer}
                    calendarClassName="add-action-datepicker"
                    customInput={<ScheduleDateTimeInput />}
                  />
                </div>

                {/* Right: Buttons grouped in columns (each column has two buttons) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickTimeSelect('after_1_hour')}
                      className={`px-4 py-2 text-sm rounded-lg border-2 transition-colors ${actionData.selectedQuickOption === 'after_1_hour' ? 'bg-teal-600 text-white border-teal-500 ring-2 ring-teal-400/40' : (isLight ? 'bg-gray-100 text-slate-700 border-gray-300 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 border-gray-500 hover:bg-gray-600')}`}
                    >
                      {isArabic ? 'بعد ساعة' : 'After 1 hour'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickTimeSelect('after_2_hours')}
                      className={`px-4 py-2 text-sm rounded-lg border-2 transition-colors ${actionData.selectedQuickOption === 'after_2_hours' ? 'bg-teal-600 text-white border-teal-500 ring-2 ring-teal-400/40' : (isLight ? 'bg-gray-100 text-slate-700 border-gray-300 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 border-gray-500 hover:bg-gray-600')}`}
                    >
                      {isArabic ? 'بعد ساعتين' : 'After 2 hours'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickTimeSelect('tomorrow')}
                      className={`px-4 py-2 text-sm rounded-lg border-2 transition-colors ${actionData.selectedQuickOption === 'tomorrow' ? 'bg-teal-600 text-white border-teal-500 ring-2 ring-teal-400/40' : (isLight ? 'bg-gray-100 text-slate-700 border-gray-300 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 border-gray-500 hover:bg-gray-600')}`}
                    >
                      {isArabic ? 'غداً' : 'Tomorrow'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickTimeSelect('next_week')}
                      className={`px-4 py-2 text-sm rounded-lg border-2 transition-colors ${actionData.selectedQuickOption === 'next_week' ? 'bg-teal-600 text-white border-teal-500 ring-2 ring-teal-400/40' : (isLight ? 'bg-gray-100 text-slate-700 border-gray-300 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 border-gray-500 hover:bg-gray-600')}`}
                    >
                      {isArabic ? 'الأسبوع القادم' : 'Next Week'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isTransferStageSelected && (
          <>
          {/* Comment */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
              {isArabic
                ? (!selectedStageBehavior.comment_required ? 'تعليق' : 'تعليق *')
                : (!selectedStageBehavior.comment_required ? 'Comment' : 'Comment *')}
            </label>
            <textarea
              name="notes"
              value={actionData.notes}
              onChange={handleInputChange}
              placeholder={isArabic
                ? (actionData.nextAction === 'cancel'
                  ? 'سيتم وضع سبب الإلغاء تلقائيًا هنا...'
                  : 'اكتب تعليقك هنا. يُسمح بعدد غير محدود من الكلمات...')
                : (actionData.nextAction === 'cancel'
                  ? 'Cancel reason will be filled here automatically...'
                  : actionData.nextAction === 'not_interested'
                    ? 'Not interest reason will be filled here automatically...'
                    : 'Write your comment here. Unlimited words are allowed...')}
              rows="4"
              className={`${isLight ? 'w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-gray-400' : 'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400'} resize-none`}
              required={selectedStageBehavior.comment_required}
            />
          </div>
          </>
          )}

          {/* Buttons */}
          <div className="flex justify-between gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-sm bg-red-600 hover:bg-red-700 text-white border-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (isTransferStageSelected && !transferSelectedUser?.id)}
              className="btn btn-sm relative bg-blue-600 hover:bg-blue-700 !text-transparent border-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="absolute inset-0 flex items-center justify-center text-white">
                {submitButtonLabel}
              </span>
              {isSubmitting ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ الأكشن' : 'Save Action')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (inline) return content;
  if (!isOpen) return null;
  return createPortal(content, document.body);
};

export default AddActionModal;
