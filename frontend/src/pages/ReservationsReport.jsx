import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useTheme } from '@shared/context/ThemeProvider'
import { getRequests as getRealEstateRequests } from '../data/realEstateRequests'
import { getRequests as getInventoryRequests } from '../data/inventoryRequests'
import { PieChart } from '../shared/components/PieChart'
import { useAppState } from '@shared/context/AppStateProvider'
import { canExportReport } from '../shared/utils/reportPermissions'
import { api, logExportEvent } from '../utils/api'
import BackButton from '../components/BackButton'
import SearchableSelect from '../shared/components/SearchableSelect'
import { FaFileExport, FaFileExcel, FaFilePdf } from 'react-icons/fa'
import { Filter, User, Tag, Briefcase, Trophy, ChevronDown, ChevronLeft, ChevronRight, Eye, Phone, Calendar, Trash } from 'lucide-react'
import EnhancedLeadDetailsModal from '../shared/components/EnhancedLeadDetailsModal'
import LeadDetailsModal from '../components/LeadDetailsModal'
import DateRangePicker from '../shared/components/DateRangePicker'
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function ReservationsReport() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { user, company } = useAppState()
  const canExport = canExportReport(user, 'Reservations Report')
  const isRTL = i18n.language === 'ar'

  const companyType = String(company?.company_type || '').toLowerCase()
  const isRealEstate = companyType === 'real estate'
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [expandedRows, setExpandedRows] = useState({})
  const exportMenuRef = useRef(null)
  const autoExportDoneRef = useRef(false)
  const [raw, setRaw] = useState([])
  const [sourceList, setSourceList] = useState(['all'])
  const [projectList, setProjectList] = useState(['all'])
  const [unitOrItemList, setUnitOrItemList] = useState(['all'])
  const [usersList, setUsersList] = useState([])
  const [leadOwnerNames, setLeadOwnerNames] = useState({})
  const [deletingReservationId, setDeletingReservationId] = useState(null)

  const isAdminOrManager = useMemo(() => {
    if (!user) return false
    if (user.is_super_admin) return true

    const role = String(user.role || '').toLowerCase()
    return ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager', 'sales manager', 'branch manager'].includes(role)
  }, [user])

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/api/users')
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setUsersList(data)
      } catch (e) {
        console.error('Failed to fetch users for reservations report', e)
        setUsersList([])
      }
    }
    fetchUsers()
  }, [])

  useEffect(() => {
    const fetchProjectsOrItems = async () => {
      try {
        let names = []
        if (companyType === 'real estate') {
          const res = await api.get('/api/projects')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          names = data.map(p => p.name || p.name_ar || p.title).filter(Boolean)
        } else if (companyType === 'general') {
          const res = await api.get('/api/items?all=1')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          names = data.map(it => it.name || it.product || it.title).filter(Boolean)
        } else {
          const set = new Set(raw.map(r => r.project).filter(Boolean))
          names = Array.from(set)
        }
        const unique = Array.from(new Set(names))
        setProjectList(['all', ...unique])
      } catch (e) {
        console.error('Failed to fetch projects/items for reservations report', e)
        const set = new Set(raw.map(r => r.project).filter(Boolean))
        setProjectList(['all', ...Array.from(set)])
      }
    }
    fetchProjectsOrItems()
  }, [companyType, raw])

  useEffect(() => {
    const fetchUnitsOrItems = async () => {
      try {
        let names = []

        if (companyType === 'real estate') {
          const res = await api.get('/api/properties?all=1')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          names = data.map((p) => String(
            p.unit_number || p.unitNumber || p.unit_code || p.unitCode || p.name || p.title || ''
          ).trim()).filter(Boolean)
        } else if (companyType === 'general') {
          const res = await api.get('/api/items?all=1')
          const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
          names = data.map((it) => String(it.name || it.product || it.title || '').trim()).filter(Boolean)
        } else {
          const [propsRes, itemsRes] = await Promise.all([
            api.get('/api/properties?all=1').catch(() => ({ data: [] })),
            api.get('/api/items?all=1').catch(() => ({ data: [] })),
          ])
          const props = Array.isArray(propsRes.data) ? propsRes.data : (propsRes.data?.data || [])
          const items = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.data || [])
          names = [
            ...props.map((p) => String(p.unit_number || p.unit_code || p.name || p.title || '').trim()),
            ...items.map((it) => String(it.name || it.product || it.title || '').trim()),
          ].filter(Boolean)
        }

        const fromRaw = raw.map((r) => String(r.unitOrItemName || '').trim()).filter(Boolean)
        const unique = Array.from(new Set([...names, ...fromRaw])).sort((a, b) => a.localeCompare(b))
        setUnitOrItemList(['all', ...unique])
      } catch (e) {
        console.error('Failed to fetch units/items for reservations report', e)
        const fromRaw = raw.map((r) => String(r.unitOrItemName || '').trim()).filter(Boolean)
        setUnitOrItemList(['all', ...Array.from(new Set(fromRaw))])
      }
    }
    fetchUnitsOrItems()
  }, [companyType, raw])

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await api.get('/api/sources?active=1')
        const data = Array.isArray(res.data) ? res.data : (res.data.data || [])
        const names = Array.from(new Set(data.map(s => s.name).filter(Boolean)))
        setSourceList(['all', ...names])
      } catch (e) {
        console.error('Failed to fetch sources', e)
        const set = new Set(raw.map(r => r.source).filter(Boolean))
        setSourceList(['all', ...Array.from(set)])
      }
    }
    fetchSources()
  }, [])

  const formatReservationType = (row) => {
    const rowId = String(row?.id || '')
    if (rowId.startsWith('RE-')) return isRTL ? 'وحدة' : 'unit'
    if (rowId.startsWith('INV-')) return isRTL ? 'صنف' : 'item'
    if (companyType === 'real estate') return isRTL ? 'وحدة' : 'unit'
    if (companyType === 'general') return isRTL ? 'صنف' : 'item'
    return ''
  }

  const isRealEstateReservationRow = (row) => String(row?.id || '').startsWith('RE-')

  const resolveReservationValue = (item) => {
    const meta = item?.meta_data || item?.metaData || {}
    const total = meta?.total ?? meta?.reservation_amount ?? meta?.amount ?? item?.amount
    if (total !== null && total !== undefined && total !== '') {
      return typeof total === 'number' ? total : parseFloat(total) || 0
    }
    const price = parseFloat(meta?.price ?? item?.price ?? 0) || 0
    const qty = parseInt(item?.quantity ?? meta?.quantity ?? 1, 10) || 1
    return price * qty
  }

  const buildPropertyLookup = (properties) => {
    const byId = new Map()
    const byRef = new Map()

    ;(Array.isArray(properties) ? properties : []).forEach((property) => {
      const id = String(property?.id || '').trim()
      const unitNumber = String(property?.unit_number || property?.unitNumber || '').trim()
      const refs = [
        id,
        String(property?.unit_code || property?.unitCode || '').trim(),
        unitNumber,
        String(property?.name || '').trim(),
        String(property?.title || '').trim(),
      ].filter(Boolean)

      if (id) byId.set(id, property)
      refs.forEach((ref) => byRef.set(ref, property))
    })

    return { byId, byRef }
  }

  const resolveReservationUnitName = (item, propertyLookup) => {
    const meta = item?.meta_data || item?.metaData || {}
    const propertyId = String(meta?.property_id || '').trim()
    const storedValue = String(item?.unit || meta?.unit || '').trim()

    const property =
      (propertyId && propertyLookup.byId.get(propertyId)) ||
      (storedValue && propertyLookup.byRef.get(storedValue)) ||
      null

    return String(
      property?.unit_number ||
      property?.unitNumber ||
      storedValue
    ).trim()
  }

  const resolveReservationReportStatus = (item) => {
    const meta = item?.meta_data || item?.metaData || {}
    const raw = String(meta?.report_status || item?.status || '').trim().toLowerCase()
    return ['cancelled', 'canceled', 'rejected'].includes(raw) ? 'cancelled' : 'done'
  }

  const openPropertyByUnit = (row) => {
    const unitValue = String(row?.unitOrItemName || '').trim()
    if (!unitValue || !isRealEstateReservationRow(row)) return
    navigate(`/inventory/properties?unit=${encodeURIComponent(unitValue)}`)
  }

  const renderUnitOrItemCell = (row) => {
    const value = String(row?.unitOrItemName || '').trim()
    if (!value) return '-'
    if (isRealEstateReservationRow(row)) {
      return (
        <button
          type="button"
          onClick={() => openPropertyByUnit(row)}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {value}
        </button>
      )
    }
    return value
  }

  const resolveHandledBy = (item) => {
    const meta = item?.meta_data || item?.metaData || {}

    const assignedValue = item?.assigned_to
    if (assignedValue !== null && assignedValue !== undefined && assignedValue !== '') {
      const assignedString = String(assignedValue).trim()
      const matchedUser = usersList.find(
        (u) => String(u.id) === assignedString || String(u.name).trim() === assignedString
      )

      return matchedUser?.name || assignedString
    }

    if (meta?.assigned_to_name) return meta.assigned_to_name

    const assignedMetaId = meta?.assigned_to_id
    if (assignedMetaId !== null && assignedMetaId !== undefined && assignedMetaId !== '') {
      const matchedUser = usersList.find((u) => String(u.id) === String(assignedMetaId))
      if (matchedUser?.name) return matchedUser.name
    }

    const preferredActorName =
      meta?.sales_person_name ||
      meta?.sales_rep_name ||
      meta?.sales_person ||
      meta?.created_by_name

    if (preferredActorName) return preferredActorName

    const actorId = meta?.sales_person_id || meta?.created_by_id
    if (actorId !== null && actorId !== undefined && actorId !== '') {
      const matchedUser = usersList.find((u) => String(u.id) === String(actorId))
      if (matchedUser?.name) return matchedUser.name
    }

    return ''
  }

  const fetchData = async () => {
    try {
      const LIMIT = 1000
      let realEstate = []
      let inventory = []
      let properties = []

      if (companyType === 'real estate') {
         const [re, propsRes] = await Promise.all([
           getRealEstateRequests(1, LIMIT),
           api.get('/api/properties?all=1').catch(() => ({ data: [] })),
         ])
         realEstate = re
         properties = Array.isArray(propsRes.data) ? propsRes.data : (propsRes.data?.data || [])
      } else if (companyType === 'general') {
         inventory = await getInventoryRequests(1, LIMIT)
      } else {
         const [re, inv, propsRes] = await Promise.all([
           getRealEstateRequests(1, LIMIT),
           getInventoryRequests(1, LIMIT),
           api.get('/api/properties?all=1').catch(() => ({ data: [] })),
         ])
         realEstate = re
         inventory = inv
         properties = Array.isArray(propsRes.data) ? propsRes.data : (propsRes.data?.data || [])
      }

      const propertyLookup = buildPropertyLookup(properties)

      const realEstateRows = Array.isArray(realEstate) ? realEstate.map(item => ({
        id: `RE-${item.id}`,
        leadId: item.lead_id || item.leadId || item.meta_data?.lead_id || item.metaData?.lead_id || null,
        customer: item.customer || item.customer_name || '',
        contact: item.phone || '',
        reservationDateTime: item.created_at || item.date || '',
        type: 'unit',
        status: resolveReservationReportStatus(item),
        value: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount || '0') || 0,
        handledBy: resolveHandledBy(item),
        manager: '',
        createdOn: item.created_at || '',
        lastAction: item.updated_at || item.date || '',
        source: item.source || '',
        project: item.project || '',
        unitOrItemName: resolveReservationUnitName(item, propertyLookup),
        meta_data: item.meta_data || null
      })) : []

      const inventoryRows = Array.isArray(inventory) ? inventory.map(item => ({
        id: `INV-${item.id}`,
        leadId: item.lead_id || item.leadId || item.meta_data?.lead_id || item.metaData?.lead_id || null,
        customer: item.customer_name || '',
        contact: item.phone || item.customer_phone || item.meta_data?.customer_phone || item.metaData?.customer_phone || '',
        reservationDateTime: item.created_at || '',
        type: 'item',
        status: resolveReservationReportStatus(item),
        value: resolveReservationValue(item),
        handledBy: resolveHandledBy(item),
        manager: '',
        createdOn: item.created_at || '',
        lastAction: item.updated_at || '',
        source: item.source || item.meta_data?.source || item.metaData?.source || '',
        project: item.project || item.meta_data?.project || item.metaData?.project || '',
        unitOrItemName: item.product || item.property_unit || item.meta_data?.product || item.metaData?.product || '',
        meta_data: item.meta_data || null
      })) : []

      setRaw([...realEstateRows, ...inventoryRows])
    } catch (e) {
      console.error('Failed to load reservations data', e)
      setRaw([])
    }
  }

  useEffect(() => {
    fetchData()

    const handleRealEstateUpdate = () => {
      fetchData()
    }
    const handleInventoryUpdate = () => {
      fetchData()
    }

    window.addEventListener('real-estate-requests-updated', handleRealEstateUpdate)
    window.addEventListener('inventory-requests-updated', handleInventoryUpdate)

    return () => {
      window.removeEventListener('real-estate-requests-updated', handleRealEstateUpdate)
      window.removeEventListener('inventory-requests-updated', handleInventoryUpdate)
    }
  }, [companyType, usersList])

  const getReservationApiTarget = (reservation) => {
    const rawId = String(reservation?.id || '')

    if (rawId.startsWith('RE-')) {
      return { resource: 'real-estate-requests', id: rawId.slice(3), eventName: 'real-estate-requests-updated' }
    }

    if (rawId.startsWith('INV-')) {
      return { resource: 'inventory-requests', id: rawId.slice(4), eventName: 'inventory-requests-updated' }
    }

    return null
  }

  const handleDeleteReservation = async (reservation) => {
    if (!isAdminOrManager || deletingReservationId) return

    const target = getReservationApiTarget(reservation)
    if (!target?.id) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'error',
          message: isRTL ? 'تعذر تحديد السجل المطلوب حذفه' : 'Unable to resolve reservation record for deletion'
        }
      }))
      return
    }

    const confirmed = window.confirm(
      isRTL ? 'هل أنت متأكد من حذف هذا الحجز؟' : 'Are you sure you want to delete this reservation?'
    )
    if (!confirmed) return

    setDeletingReservationId(reservation.id)

    try {
      await api.delete(`/api/${target.resource}/${target.id}`)
      setRaw((prev) => prev.filter((row) => row.id !== reservation.id))
      window.dispatchEvent(new Event(target.eventName))
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'success',
          message: isRTL ? 'تم حذف الحجز بنجاح' : 'Reservation deleted successfully'
        }
      }))
    } catch (error) {
      console.error('Failed to delete reservation', error)
      const message = error?.response?.data?.message || (isRTL ? 'فشل حذف الحجز' : 'Failed to delete reservation')
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'error',
          message
        }
      }))
    } finally {
      setDeletingReservationId(null)
    }
  }

  const openLeadPreview = async (reservation) => {
    const leadId = reservation.leadId || reservation.lead_id || reservation.metaData?.lead_id || reservation.meta_data?.lead_id;
    const digits = String(reservation.contact || '').replace(/[^0-9]/g, '');
    const reservationName = String(reservation.customer || '').trim().toLowerCase();

    const fallbackLead = {
      // IMPORTANT: don't use reservation row id like "RE-123" as a lead id,
      // otherwise the details modal will try to fetch /api/leads/RE-123 and show empty/error.
      id: leadId || null,
      fullName: reservation.customer,
      name: reservation.customer,
      leadName: reservation.customer,
      mobile: reservation.contact,
      phone: reservation.contact,
      source: reservation.source,
      status: reservation.status,
      stage: reservation.status,
      assignedTo: reservation.handledBy,
      company: reservation.project || '',
      location: reservation.project || '',
      notes: reservation.type ? `${reservation.type} | ${reservation.value || 0} EGP` : ''
    };

    const pickBestLeadMatch = (list) => {
      if (!Array.isArray(list) || list.length === 0) {
        return null;
      }

      const normalized = list.filter(Boolean);

      if (leadId) {
        const byId = normalized.find((lead) => String(lead?.id || '') === String(leadId));
        if (byId) {
          return byId;
        }
      }

      if (digits) {
        const exactPhoneAndName = normalized.find((lead) => {
          const leadDigits = String(lead?.phone || '').replace(/[^0-9]/g, '');
          const leadName = String(lead?.name || lead?.fullName || '').trim().toLowerCase();
          return leadDigits === digits && leadName === reservationName;
        });
        if (exactPhoneAndName) {
          return exactPhoneAndName;
        }

        const exactPhone = normalized.find((lead) => {
          const leadDigits = String(lead?.phone || '').replace(/[^0-9]/g, '');
          return leadDigits === digits;
        });
        if (exactPhone) {
          return exactPhone;
        }
      }

      if (reservationName) {
        const exactName = normalized.find((lead) => {
          const leadName = String(lead?.name || lead?.fullName || '').trim().toLowerCase();
          return leadName === reservationName;
        });
        if (exactName) {
          return exactName;
        }
      }

      return normalized[0] || null;
    };

    const searchLeadList = async (searchValue) => {
      if (!searchValue) {
        return null;
      }

      const listRes = await api.get('/api/leads', {
        params: {
          search: searchValue,
          per_page: 25,
        },
      });

      const list = Array.isArray(listRes.data?.data)
        ? listRes.data.data
        : (Array.isArray(listRes.data) ? listRes.data : []);

      return pickBestLeadMatch(list);
    };

    if (leadId) {
      try {
        const res = await api.get(`/api/leads/${leadId}`);
        const leadFromServer = res.data?.data || res.data;
        if (leadFromServer?.id) {
          setSelectedLead(leadFromServer);
          setShowLeadModal(true);
          return;
        }
      } catch (error) {
        console.warn('Failed to load lead by reservation lead_id, trying lead search fallback', error);
      }
    }

    try {
      let matchedLead = null;

      if (digits) {
        matchedLead = await searchLeadList(digits);
      }

      if (!matchedLead && reservation.customer) {
        matchedLead = await searchLeadList(reservation.customer);
      }

      if (matchedLead?.id) {
        setSelectedLead(matchedLead);
      } else {
        console.warn('Failed to resolve real lead from reservation row, using final fallback.');
        setSelectedLead(fallbackLead);
      }
    } catch (error) {
      console.warn('Failed to lookup lead from reservations report, using final fallback', error);
      setSelectedLead(fallbackLead);
    }

    setShowLeadModal(true);
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const exportToExcel = () => {
    const dataToExport = filtered.map(r => ({
      [isRTL ? 'مسؤول المبيعات' : 'Sales Person']: resolveSalesPersonDisplay(r),
      [isRTL ? 'العميل' : 'Lead Name']: r.customer,
      [isRTL ? 'رقم الهاتف' : 'Contact']: r.contact,
      [isRTL ? 'المصدر' : 'Source']: r.source,
      [projectColumnLabel]: r.project,
      [isRTL ? 'نوع الحجز' : 'Reservation Type']: formatReservationType(r),
      [unitNumberColumnLabel]: r.unitOrItemName,
      [isRTL ? 'إجمالي المبلغ' : 'Total Amount']: r.value,
      [isRTL ? 'تاريخ الحجز' : 'Reservation Date']: new Date(r.reservationDateTime).toLocaleString(),
      [isRTL ? 'الحالة' : 'Status']: r.status
    }))

    const ws = XLSX.utils.json_to_sheet(dataToExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Reservations")
    const fileName = "Reservations_Report.xlsx"
    XLSX.writeFile(wb, fileName)
    logExportEvent({
      module: "Reservations Report",
      fileName,
      format: "xlsx",
    })
    setShowExportMenu(false)
  }

  const exportToPdf = async () => {
    try {
      const jsPDF = (await import('jspdf')).default
      const autoTable = await import('jspdf-autotable')
      const doc = new jsPDF()
      
      const tableColumn = [
        isRTL ? 'مسؤول المبيعات' : 'Sales Person',
        isRTL ? 'العميل' : 'Lead Name',
        isRTL ? 'رقم الهاتف' : 'Contact',
        isRTL ? 'المصدر' : 'Source',
        projectColumnLabel,
        isRTL ? 'نوع الحجز' : 'Reservation Type',
        unitNumberColumnLabel,
        isRTL ? 'إجمالي المبلغ' : 'Total Amount',
        isRTL ? 'تاريخ الحجز' : 'Reservation Date',
        isRTL ? 'الحالة' : 'Status'
      ]
      
      const tableRows = []

      filtered.forEach(r => {
        const rowData = [
          resolveSalesPersonDisplay(r),
          r.customer,
          r.contact,
          r.source,
          r.project,
          formatReservationType(r),
          r.unitOrItemName,
          r.value,
          new Date(r.reservationDateTime).toLocaleString(),
          r.status
        ]
        tableRows.push(rowData)
      })

      doc.text(isRTL ? 'تقرير الحجوزات' : "Reservations Report", 14, 15)
      autoTable.default(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { font: 'helvetica', fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      })
      doc.save("reservations_report.pdf")
      logExportEvent({
        module: "Reservations Report",
        fileName: "reservations_report.pdf",
        format: "pdf",
      })
      setShowExportMenu(false)
    } catch (error) {
      console.error("Export PDF Error:", error)
    }
  }

  const isSuperManagerRole = (role) => {
    const r = String(role || '').toLowerCase()
    return (
      r === 'admin' ||
      r === 'tenant admin' ||
      r === 'tenant-admin' ||
      r === 'operation manager' ||
      r === 'sales admin' ||
      r === 'director' ||
      r === 'branch manager'
    )
  }

  const getDescendants = (rootId, allUsers) => {
    let descendants = []
    const direct = allUsers.filter(u => u.manager_id === rootId)
    direct.forEach(u => {
      descendants.push(u)
      descendants = descendants.concat(getDescendants(u.id, allUsers))
    })
    return descendants
  }

  // Filters
  const initialParams = new URLSearchParams(location.search || '')
  const initialFrom = initialParams.get('date_from') || initialParams.get('reservation_date_from') || initialParams.get('created_from') || ''
  const initialTo = initialParams.get('date_to') || initialParams.get('reservation_date_to') || initialParams.get('created_to') || ''

  const [staff, setStaff] = useState('all')
  const [manager, setManager] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [source, setSource] = useState('all')
  const [project, setProject] = useState('all')
  const [unitFilter, setUnitFilter] = useState('all')
  const [lastActionDate, setLastActionDate] = useState('')
  const [reservationDateFrom, setReservationDateFrom] = useState(initialFrom)
  const [reservationDateTo, setReservationDateTo] = useState(initialTo)
  const [showAllFilters, setShowAllFilters] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const from = params.get('date_from') || params.get('reservation_date_from') || params.get('created_from') || ''
    const to = params.get('date_to') || params.get('reservation_date_to') || params.get('created_to') || ''
    setReservationDateFrom(from)
    setReservationDateTo(to)
  }, [location.search])

  const staffList = useMemo(() => {
    if (!usersList || usersList.length === 0) {
      const set = new Set(raw.map(r => r.handledBy).filter(Boolean))
      return ['all', ...Array.from(set)]
    }

    if (!manager || manager === 'all') {
      const uniqueUsers = Array.from(new Map(usersList.map(u => [u.id, u])).values())
      return ['all', ...uniqueUsers.map(u => u.name).filter(Boolean)]
    }

    const selectedManagers = usersList.filter(u => String(u.id) === String(manager))
    const hasSuperManager = selectedManagers.some(u => isSuperManagerRole(u.role))

    let candidates

    if (hasSuperManager) {
      candidates = usersList
    } else {
      const all = []
      selectedManagers.forEach(m => {
        all.push(m)
        const subs = getDescendants(m.id, usersList)
        subs.forEach(s => {
          all.push(s)
        })
      })
      const map = new Map()
      all.forEach(u => {
        if (!map.has(u.id)) {
          map.set(u.id, u)
        }
      })
      candidates = Array.from(map.values())
    }

    const names = candidates.map(u => u.name).filter(Boolean)
    return ['all', ...Array.from(new Set(names))]
  }, [raw, usersList, manager])

  const managerList = useMemo(() => {
    if (!usersList || usersList.length === 0) {
      return [{ id: 'all', name: 'all' }]
    }
    const managers = usersList.filter(u => {
      const role = String(u.role || '').toLowerCase()
      const isSalesPerson = role.includes('sales person') || role.includes('salesperson')
      return !isSalesPerson
    })
    const uniqueManagers = Array.from(new Map(managers.map(m => [m.id, m])).values())
    return [
      { id: 'all', name: 'all' },
      ...uniqueManagers.map(m => ({
        id: String(m.id),
        name: m.name || `#${m.id}`,
        role: m.role || ''
      }))
    ]
  }, [usersList])

  const statusOptions = useMemo(() => ([
    { value: 'all', label: isRTL ? 'الكل' : 'All' },
    { value: 'done', label: 'done' },
    { value: 'cancelled', label: 'cancelled' },
  ]), [isRTL])

  const filtered = useMemo(() => {
    return raw.filter(r => {
      const byStaff = staff === 'all' ? true : r.handledBy === staff
      const byStatus = statusFilter === 'all'
        ? true
        : String(r.status || '').toLowerCase() === String(statusFilter).toLowerCase()
      const byManager = (() => {
        if (!usersList || manager === 'all') return true
        const mgr = usersList.find(u => String(u.id) === String(manager))
        if (!mgr) return true
        const all = [mgr, ...getDescendants(mgr.id, usersList)]
        const salesNames = new Set(all.map(u => u.name).filter(Boolean))
        return !r.handledBy || salesNames.has(r.handledBy)
      })()
      const bySource = source === 'all' ? true : r.source === source
      const byProject = project === 'all' ? true : r.project === project
      const byUnit = unitFilter === 'all'
        ? true
        : String(r.unitOrItemName || '').trim() === String(unitFilter).trim()
      const byLastAction = !lastActionDate ? true : String(r.lastAction || '').slice(0, 10) === lastActionDate
      const byReservationDate = (() => {
        if (!reservationDateFrom && !reservationDateTo) return true
        const d = String(r.reservationDateTime || '').slice(0, 10)
        if (!d) return false
        if (reservationDateFrom && d < reservationDateFrom) return false
        if (reservationDateTo && d > reservationDateTo) return false
        return true
      })()
      return byStaff && byStatus && byManager && bySource && byProject && byUnit && byLastAction && byReservationDate
    })
  }, [raw, staff, statusFilter, manager, source, project, unitFilter, lastActionDate, reservationDateFrom, reservationDateTo])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('export') !== '1') {
      autoExportDoneRef.current = false
      return
    }

    if (!canExport || !filtered.length || autoExportDoneRef.current) return

    autoExportDoneRef.current = true

    const run = async () => {
      const format = String(params.get('format') || 'xlsx').toLowerCase()
      if (format === 'pdf') {
        await exportToPdf()
      } else {
        await exportToExcel()
      }

      params.delete('export')
      params.delete('format')
      params.delete('file_name')
      const nextSearch = params.toString()
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
    }

    run()
  }, [canExport, filtered, location.pathname, location.search, navigate])

  const [entriesPerPage, setEntriesPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(filtered.length / entriesPerPage))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage
    return filtered.slice(start, start + entriesPerPage)
  }, [filtered, currentPage, entriesPerPage])

  useEffect(() => {
    const visibleLeadIds = Array.from(new Set(
      paginatedRows
        .map((row) => row?.leadId)
        .filter((leadId) => leadId !== null && leadId !== undefined && leadId !== '')
        .map((leadId) => String(leadId))
    ));

    const missingLeadIds = visibleLeadIds.filter((leadId) => !leadOwnerNames[leadId]);
    if (missingLeadIds.length === 0) return;

    let isMounted = true;

    const loadLeadOwners = async () => {
      try {
        const entries = await Promise.all(
          missingLeadIds.map(async (leadId) => {
            try {
              const res = await api.get(`/api/leads/${encodeURIComponent(leadId)}`);
              const lead = res.data?.data || res.data;
              const ownerName =
                lead?.assignedAgent?.name ||
                lead?.assigned_agent?.name ||
                lead?.assigned_to_name ||
                lead?.sales_person_name ||
                lead?.sales_person ||
                (typeof lead?.assigned_to === 'object' ? lead.assigned_to?.name : '') ||
                '';
              return [String(leadId), ownerName];
            } catch {
              return [String(leadId), ''];
            }
          })
        );

        if (!isMounted) return;
        setLeadOwnerNames((prev) => {
          const next = { ...prev };
          entries.forEach(([leadId, ownerName]) => {
            next[String(leadId)] = ownerName || prev[String(leadId)] || '';
          });
          return next;
        });
      } catch (e) {
        console.warn('Failed to resolve lead owners for reservations report', e);
      }
    };

    loadLeadOwners();

    return () => {
      isMounted = false;
    };
  }, [paginatedRows, leadOwnerNames]);

  const resolveSalesPersonDisplay = (row) => {
    const ownerName = leadOwnerNames[String(row?.leadId ?? '')];
    return ownerName || row?.handledBy || '';
  }

  // KPIs
  const totalReservations = filtered.length
  const totalRevenue = filtered.reduce((sum, r) => sum + (r.value || 0), 0)
  const totalLeads = useMemo(() => {
    const set = new Set(filtered.map(r => r.customer))
    return set.size
  }, [filtered])
  const confirmedReservations = filtered.filter(r => {
    const v = String(r.status || '').toLowerCase()
    return v === 'done'
  }).length

  // Charts data
  const sourceCounts = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      const key = r.source || (isRTL ? 'غير معروف' : 'Unknown')
      map.set(key, (map.get(key) || 0) + 1)
    })
    return map
  }, [filtered, isRTL])

  const reservationsBySourceSegments = useMemo(() => {
    const baseColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#22c55e']
    return Array.from(sourceCounts.entries()).map(([label, value], idx) => ({
      label,
      value,
      color: baseColors[idx % baseColors.length]
    }))
  }, [sourceCounts])

  const projectLabels = useMemo(() => Array.from(new Set(filtered.map(r => r.project))), [filtered])
  const reservationsByProjectData = useMemo(() => {
    return {
      labels: projectLabels,
      datasets: [{
        label: isRTL ? 'الحجوزات' : 'Reservations',
        data: projectLabels.map(p => filtered.filter(r => r.project === p).length),
        backgroundColor: '#3b82f6'
      }]
    }
  }, [filtered, projectLabels, isRTL])

  const projectColumnLabel = isRTL ? 'المشروع' : 'Project'
  const unitNumberColumnLabel = isRealEstate
    ? (isRTL ? 'رقم الوحدة' : 'Unit Number')
    : (isRTL ? 'اسم الصنف' : 'Item Name')
  const totalAmountColumnLabel = isRTL ? 'إجمالي المبلغ' : 'Total Amount'

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          precision: 0
        }
      },
      x: {
        title: {
          display: true,
          text: isRealEstate ? (isRTL ? 'المشاريع' : 'Projects') : (isRTL ? 'الصنف' : 'Item')
        }
      }
    }
  }

  const leaderboard = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      const key = resolveSalesPersonDisplay(r) || (isRTL ? 'غير معروف' : 'Unknown')
      if (!map.has(key)) {
        map.set(key, { name: key, reservations: 0, value: 0 })
      }
      const item = map.get(key)
      item.reservations += 1
      item.value += r.value || 0
    })
    return Array.from(map.values()).sort((a, b) => {
      if (b.reservations !== a.reservations) return b.reservations - a.reservations
      return b.value - a.value
    })
  }, [filtered, isRTL])

  const statusClass = (s) => {
    const value = String(s || '').toLowerCase()
    if (value === 'done') {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    }
    if (value === 'cancelled' || value === 'canceled' || value === 'rejected') {
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
    }
    return `bg-gray-100 dark:bg-gray-900 ${isLight ? 'text-black' : 'text-white'}`
  }

  return (
    <>
      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <BackButton to="/reports" />
            <h1 className="text-2xl font-semibold">{isRTL ? 'الحجوزات' : 'Reservations'}</h1>
          </div>

        </div>

        <div className="bg-theme-bg backdrop-blur-md border border-theme-border dark:border-gray-700/50 p-4 rounded-2xl shadow-sm mb-3">
          <div className="flex justify-between items-center mb-3">
            <div className={`flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'} font-semibold`}>
            <Filter size={20} className="text-blue-500 dark:text-blue-400" />
            <h3 className={`${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'تصفية' : 'Filter'}</h3>
          </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAllFilters(!showAllFilters)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                {showAllFilters ? (isRTL ? 'إخفاء' : 'Hide') : (isRTL ? 'إظهار الكل' : 'Show All')}
              </button>
              <button
                onClick={() => {
                  setStaff('all')
                  setManager('all')
                  setStatusFilter('all')
                  setSource('all')
                  setProject('all')
                  setUnitFilter('all')
                  setLastActionDate('')
                  setReservationDateFrom('')
                  setReservationDateTo('')
                  setCurrentPage(1)
                }}
                className={`px-3 py-1.5 text-sm ${isLight ? 'text-black' : 'text-white'} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors`}
              >
                {isRTL ? 'إعادة تعيين' : 'Reset'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
              <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                    <User size={12} className="text-blue-500 dark:text-blue-400" />
                    {isRTL ? 'مسؤول المبيعات' : 'Sales Person'}
                  </label>
                <SearchableSelect
                  value={staff}
                  onChange={(v) => {
                    setStaff(v)
                    setCurrentPage(1)
                  }}
                >
                  {staffList.map(s => <option key={s} value={s}>{s === 'all' ? (isRTL ? 'الكل' : 'All') : s}</option>)}
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <User size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'المدير' : 'Manager'}
                </label>
                <SearchableSelect
                  value={manager}
                  onChange={(v) => {
                    setManager(v)
                    setCurrentPage(1)
                  }}
                >
                  {managerList.map(m => {
                    const roleLabel = m.id === 'all' ? '' : (m.role || '')
                    const text = m.id === 'all'
                      ? (isRTL ? 'الكل' : 'All')
                      : roleLabel
                        ? `${m.name || `#${m.id}`} (${roleLabel})`
                        : (m.name || `#${m.id}`)
                    return (
                      <option key={m.id} value={m.id}>
                        {text}
                      </option>
                    )
                  })}
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'الحالة' : 'Status'}
                </label>
                <SearchableSelect
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v)
                    setCurrentPage(1)
                  }}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? 'المصدر' : 'Source'}
                </label>
                <SearchableSelect
                  value={source}
                  onChange={(v) => {
                    setSource(v)
                    setCurrentPage(1)
                  }}
                >
                  {sourceList.map(s => <option key={s} value={s}>{s === 'all' ? (isRTL ? 'الكل' : 'All') : s}</option>)}
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                  <Briefcase size={12} className="text-blue-500 dark:text-blue-400" />
                  {isRTL ? (isRealEstate ? 'المشروع' : 'المنتج') : (isRealEstate ? 'Project' : 'Item')}
                </label>
                <SearchableSelect
                  value={project}
                  onChange={(v) => {
                    setProject(v)
                    setCurrentPage(1)
                  }}
                >
                  {projectList.map(p => <option key={p} value={p}>{p === 'all' ? (isRTL ? 'الكل' : 'All') : p}</option>)}
                </SearchableSelect>
              </div>

              {showAllFilters && (
                <>
                  <div className="space-y-1">
                    <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                      <Tag size={12} className="text-blue-500 dark:text-blue-400" />
                      {isRealEstate ? (isRTL ? 'رقم الوحدة' : 'Unit Number') : (isRTL ? 'اسم الصنف' : 'Item Name')}
                    </label>
                    <SearchableSelect
                      value={unitFilter}
                      onChange={(v) => {
                        setUnitFilter(v)
                        setCurrentPage(1)
                      }}
                    >
                      {unitOrItemList.map((u) => (
                        <option key={u} value={u}>{u === 'all' ? (isRTL ? 'الكل' : 'All') : u}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1">
                    <label className={`flex items-center gap-1 text-xs font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                      <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
                      {isRTL ? 'تاريخ الحجز' : 'Reservation Date'}
                    </label>
                    <DateRangePicker
                      from={reservationDateFrom}
                      to={reservationDateTo}
                      onChange={({ from, to }) => {
                        setReservationDateFrom(from)
                        setReservationDateTo(to)
                        setCurrentPage(1)
                      }}
                      isRTL={isRTL}
                      className={`w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 dark:bg-gray-900 ${isLight ? 'text-black' : 'text-white'} focus:ring-2 focus:ring-blue-500/20`}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="h-3" aria-hidden="true"></div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: isRTL ? 'إجمالي الحجوزات' : 'Total Reservations', value: totalReservations, accent: 'bg-emerald-500' },
            { label: isRTL ? 'إجمالي العملاء' : 'Total Leads', value: totalLeads, accent: 'bg-indigo-500' },
            { label: isRTL ? 'قيمة الحجوزات' : 'Total Reservations Amount', value: `${totalRevenue.toLocaleString()} EGP`, accent: 'bg-blue-500' }
          ].map((k) => (
            <div key={k.label} className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex items-center justify-between">
              <div>
                <div className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{k.label}</div>
                <div className="text-lg font-semibold">{k.value}</div>
              </div>
              <div className={`w-8 h-8 rounded-lg ${k.accent}`}></div>
            </div>
          ))}
        </div>
        <div className="h-3" aria-hidden="true"></div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
            <div className={`text-sm font-semibold mb-2 ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'الحجوزات حسب القناة' : 'Reservations by channel'}</div>
            <div className="h-48 flex items-center justify-center">
              <PieChart
                segments={reservationsBySourceSegments} 
                size={170} 
                centerValue={totalReservations} 
                centerLabel={isRTL ? 'الإجمالي' : 'Total'}
              />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {reservationsBySourceSegments.map((segment) => (
                <div key={segment.label} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }}></div>
                  <span className={`${isLight ? 'text-black' : 'text-white'}`}>{segment.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex flex-col">
            <div className="text-sm font-semibold mb-2">
              {isRTL
                ? (isRealEstate ? 'تحليل الحجوزات حسب المشروع' : 'تحليل الحجوزات حسب الصنف')
                : (isRealEstate ? 'Reservations by Project Analysis' : 'Reservations by Item Analysis')
              }
            </div>
            <div className="flex-1 mt-6 w-full min-h-[200px]">
              <Bar data={reservationsByProjectData} options={barOptions} />
            </div>
          </div>
          <div className="group relative backdrop-blur-md rounded-2xl shadow-sm hover:shadow-xl border border-theme-border dark:border-gray-700/50 p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-yellow-600 dark:text-yellow-400">
                <Trophy size={20} />
              </div>
              <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'الترتيب' : 'Ranking'}</div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {leaderboard.length === 0 && (
                  <li className={`text-xs ${isLight ? 'text-black' : 'text-white'} text-center py-4`}>{isRTL ? 'لا توجد بيانات' : 'No data'}</li>
                )}
                {leaderboard.map((item, index) => {
                  let rankColor = `bg-gray-100 dark:bg-gray-700 ${isLight ? 'text-black' : 'text-white'}`;
                  let rankIcon = null;
                  
                  if (index === 0) {
                    rankColor = "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-700";
                    rankIcon = <Trophy size={12} />;
                  } else if (index === 1) {
                    rankColor = "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600";
                  } else if (index === 2) {
                    rankColor = "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-700";
                  }

                  return (
                    <li key={item.name} className="flex items-center justify-between p-3 hover:bg-gray-700/50 transition-colors group/item">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-xs shadow-sm ${rankColor}`}>
                          {rankIcon || index + 1}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-sm font-medium ${isLight ? 'text-black' : 'text-white'} group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400 transition-colors`}>
                            {item.name}
                          </span>
                          <span className={`text-[10px] ${isLight ? 'text-black' : 'text-white'}`}>
                            {index === 0 ? (isRTL ? 'الأفضل أداء' : 'Top Performer') : `${isRTL ? 'الترتيب' : 'Rank'} #${index + 1}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                          {item.reservations}
                        </span>
                        <span className={`text-[10px] ${isLight ? 'text-black' : 'text-white'}`}>
                          {isRTL ? 'حجوزات' : 'Reservations'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
        <div className="h-3" aria-hidden="true"></div>

        <div className="backdrop-blur-md rounded-2xl shadow-sm border border-theme-border dark:border-gray-700/50 overflow-hidden p-4">
          <div className="flex items-center justify-between mb-4">
            <div className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{isRTL ? 'نظرة عامة على الحجوزات' : 'Reservations Overview'}</div>
            {canExport && (
              <div className="relative" ref={exportMenuRef}>
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                <FaFileExport /> {isRTL ? 'تصدير' : 'Export'}
                <ChevronDown className={`transform transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} size={16} />
              </button>
                
                {showExportMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50 w-48 animate-in fade-in zoom-in-95 duration-200">
                    <button 
                      onClick={() => {
                        exportToExcel();
                        setShowExportMenu(false);
                      }}
                      className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-700/50 dark:hover:bg-gray-700/50 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                    >
                    <FaFileExcel className="text-green-600" size={16} /> 
                    <span>{isRTL ? 'تصدير كـ Excel' : 'Export to Excel'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      exportToPdf();
                      setShowExportMenu(false);
                    }}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}
                  >
                    <FaFilePdf className="text-red-600" size={16} /> 
                    <span>{isRTL ? 'تصدير كـ PDF' : 'Export to PDF'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={`text-xs uppercase bg-theme-bg dark:bg-white/5 ${isLight ? 'text-black' : 'text-white'}`}>
                <tr className="text-left border-b border-theme-border dark:border-gray-700">
                  <th className="py-3 px-4 md:hidden"></th>
                  <th className="py-2 px-3 hidden md:table-cell">{isRTL ? 'مسؤول المبيعات' : 'Sales Person'}</th>
                  <th className="py-2 px-3">{isRTL ? 'اسم العميل' : 'Lead Name'}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{isRTL ? 'رقم الهاتف' : 'Contact'}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{isRTL ? 'المصدر' : 'Source'}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{projectColumnLabel}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{isRTL ? 'نوع الحجز' : 'Reservation Type'}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{unitNumberColumnLabel}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{totalAmountColumnLabel}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{isRTL ? 'تاريخ الحجز' : 'Reservation Date'}</th>
                  <th className="py-2 px-3 hidden md:table-cell">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="py-2 px-3">{isRTL ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border dark:divide-gray-700/50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} className={`py-6 text-center ${isLight ? 'text-black' : 'text-white'}`}>
                      {isRTL ? 'لا توجد حجوزات تطابق الفلاتر المحددة' : 'No reservations found for selected filters'}
                    </td>
                  </tr>
                )}
                {filtered.length > 0 && paginatedRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className={`py-6 text-center ${isLight ? 'text-black' : 'text-white'}`}>
                      {isRTL ? 'لا توجد نتائج' : 'No results'}
                    </td>
                  </tr>
                )}
                {paginatedRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-theme-bg/50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 md:hidden">
                        <button 
                          onClick={() => toggleRow(r.id)} 
                          className={`p-1 hover:bg-theme-bg/50 dark:hover:bg-white/10 rounded-full transition-colors ${isLight ? 'text-black' : 'text-white'}`}
                        >
                          <ChevronRight 
                            size={16} 
                            className={`transform transition-transform duration-200 ${expandedRows[r.id] ? 'rotate-90' : ''}`}
                          />
                        </button>
                      </td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{resolveSalesPersonDisplay(r)}</td>
                      <td className={`py-2 px-3 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                        <div className="flex flex-col">
                          <span>{r.customer}</span>
                          <span className="md:hidden text-xs opacity-60">{r.contact}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 hidden md:table-cell">
                        <div className={`text-xs ${isLight ? 'text-black' : 'text-white'}`}>{r.contact}</div>
                      </td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{r.source}</td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{r.project || '-'}</td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{formatReservationType(r)}</td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{renderUnitOrItemCell(r)}</td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{r.value ? `${r.value.toLocaleString()} EGP` : '-'}</td>
                      <td className={`py-2 px-3 hidden md:table-cell ${isLight ? 'text-black' : 'text-white'}`}>{new Date(r.reservationDateTime).toLocaleString()}</td>
                      <td className="py-2 px-3 hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-md w-fit inline-flex ${statusClass(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <button 
                            title={isRTL ? 'معاينة' : 'Preview'} 
                            className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            onClick={() => openLeadPreview(r)}
                          >
                            <Eye size={16} className="text-blue-600 dark:text-blue-400" />
                          </button>
                          <button
                            title={isRTL ? 'اتصال' : 'Call'}
                            className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            onClick={() => {
                              const digits = String(r.contact || '').replace(/[^0-9+]/g, '')
                              if (digits) window.open(`tel:${digits}`, '_blank')
                            }}
                          >
                            <Phone size={16} className="text-emerald-600 dark:text-emerald-400" />
                          </button>
                          {isAdminOrManager && (
                            <button
                              title={isRTL ? 'حذف' : 'Delete'}
                              className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => handleDeleteReservation(r)}
                              disabled={deletingReservationId === r.id}
                            >
                              <Trash size={16} className="text-rose-600 dark:text-rose-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedRows[r.id] && (
                      <tr className="md:hidden bg-white/5 dark:bg-white/5">
                        <td colSpan={12} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{isRTL ? 'مسؤول المبيعات' : 'Sales Person'}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{resolveSalesPersonDisplay(r)}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{projectColumnLabel}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{r.project || '-'}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{isRTL ? 'نوع الحجز' : 'Reservation Type'}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{formatReservationType(r)}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{unitNumberColumnLabel}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{renderUnitOrItemCell(r)}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{totalAmountColumnLabel}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{r.value ? `${r.value.toLocaleString()} EGP` : '-'}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{isRTL ? 'تاريخ الحجز' : 'Reservation Date'}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{new Date(r.reservationDateTime).toLocaleString()}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{isRTL ? 'المصدر' : 'Source'}</span>
                                <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{r.source}</span>
                             </div>
                             <div className="flex flex-col gap-1">
                                <span className="text-[var(--muted-text)]">{isRTL ? 'الحالة' : 'Status'}</span>
                                <span className={`px-2 py-0.5 rounded-md w-fit ${statusClass(r.status)}`}>{isRTL ? r.status : r.status}</span>
                             </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
                  <div className="px-4 py-3 bg-[var(--content-bg)]/80 border-t border-white/10 dark:border-gray-700/60 flex sm:flex-row items-center justify-between gap-3">
                    <div className="text-[11px] sm:text-xs text-[var(--muted-text)]">
                      {isRTL
                        ? `إظهار ${Math.min((currentPage - 1) * entriesPerPage + 1, filtered.length)}-${Math.min(currentPage * entriesPerPage, filtered.length)} من ${filtered.length}`
                        : `Showing ${Math.min((currentPage - 1) * entriesPerPage + 1, filtered.length)}-${Math.min(currentPage * entriesPerPage, filtered.length)} of ${filtered.length}`}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                          disabled={currentPage === 1}
                          title={isRTL ? 'السابق' : 'Prev'}
                        >
                          {isRTL ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
              <span className="text-sm whitespace-nowrap">
                {isRTL
                  ? `الصفحة ${currentPage} من ${pageCount}`
                  : `Page ${currentPage} of ${pageCount}`}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))}
                disabled={currentPage === pageCount}
                title={isRTL ? 'التالي' : 'Next'}
              >
                {isRTL ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] sm:text-xs text-[var(--muted-text)] whitespace-nowrap">
                          {isRTL ? 'لكل صفحة:' : 'Per page:'}
                        </span>
                        <select
                          className="input w-24 text-sm py-0 px-2 h-8"
                          value={entriesPerPage}
                          onChange={(e) => {
                            setEntriesPerPage(Number(e.target.value))
                            setCurrentPage(1)
                          }}
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                  </div>
        </div>

      </div>
      
      {selectedLead && (
        <EnhancedLeadDetailsModal
          isOpen={showLeadModal}
          onClose={() => setShowLeadModal(false)}
          lead={selectedLead}
          isArabic={isRTL}
          theme={theme}
        />
      )}
    </>
  )
}

