import { useEffect, useMemo, useState } from 'react'
import {
  FaBath,
  FaBed,
  FaCheckCircle,
  FaDownload,
  FaExpand,
  FaEye,
  FaFilePdf,
  FaGlobe,
  FaMapMarkerAlt,
  FaRulerCombined,
  FaTimes,
} from 'react-icons/fa'

const CATEGORY_LABELS = {
  Residential: { en: 'Residential', ar: 'سكني' },
  Commercial: { en: 'Commercial', ar: 'تجاري' },
  Administrative: { en: 'Administrative', ar: 'إداري' },
  Medical: { en: 'Medical', ar: 'طبي' },
  Coastal: { en: 'Coastal', ar: 'ساحلي' },
  'Mixed Use': { en: 'Mixed Use', ar: 'متعدد الاستخدام' },
}

const AMENITY_LABELS = {
  'Club House': { en: 'Club House', ar: 'النادي' },
  Gym: { en: 'Gym', ar: 'صالة رياضية' },
  Spa: { en: 'Spa', ar: 'سبا' },
  'Kids Area': { en: 'Kids Area', ar: 'منطقة الأطفال' },
  'Commercial Area': { en: 'Commercial Area', ar: 'منطقة تجارية' },
  Mosque: { en: 'Mosque', ar: 'مسجد' },
  'Swimming Pools': { en: 'Swimming Pools', ar: 'مسابح' },
  Security: { en: 'Security', ar: 'أمن' },
  Parking: { en: 'Parking', ar: 'موقف سيارات' },
  'Medical Center': { en: 'Medical Center', ar: 'مركز طبي' },
  School: { en: 'School', ar: 'مدرسة' },
  University: { en: 'University', ar: 'جامعة' },
}

const PROPERTY_TYPE_LABELS = {
  Apartment: { en: 'Apartment', ar: 'شقة' },
  Villa: { en: 'Villa', ar: 'فيلا' },
  Townhouse: { en: 'Townhouse', ar: 'تاون هاوس' },
  Penthouse: { en: 'Penthouse', ar: 'بنتهاوس' },
  'Stand Alone': { en: 'Stand Alone', ar: 'ستاند ألون' },
  Duplex: { en: 'Duplex', ar: 'دوبلكس' },
  Store: { en: 'Store', ar: 'محل' },
  Shop: { en: 'Shop', ar: 'متجر' },
  Office: { en: 'Office', ar: 'مكتب' },
  Retail: { en: 'Retail', ar: 'تجاري تجزئة' },
  Warehouse: { en: 'Warehouse', ar: 'مخزن' },
  Land: { en: 'Land', ar: 'أرض' },
}

const PROPERTY_STATUS_LABELS = {
  Available: { en: 'Available', ar: 'متاحة' },
  Reserved: { en: 'Reserved', ar: 'محجوزة' },
  Sold: { en: 'Sold', ar: 'مباعة' },
  Hold: { en: 'Hold', ar: 'موقوفة' },
  Resale: { en: 'Resale', ar: 'إعادة بيع' },
}

const FINISHING_LABELS = {
  'Core & Shell': { en: 'Core & Shell', ar: 'عظم' },
  'Semi Finished': { en: 'Semi Finished', ar: 'نصف تشطيب' },
  Finished: { en: 'Finished', ar: 'تشطيب كامل' },
  Furnished: { en: 'Furnished', ar: 'مفروش' },
}

const VIEW_LABELS = {
  Front: { en: 'Front', ar: 'أمامية' },
  Back: { en: 'Back', ar: 'خلفية' },
  'Main Street': { en: 'Main Street', ar: 'شارع رئيسي' },
  Garden: { en: 'Garden', ar: 'حديقة' },
  Pool: { en: 'Pool', ar: 'حمام سباحة' },
}

const getApiOrigin = () => {
  const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || ''
  const clean = String(apiUrl).trim().replace(/\/+$/, '')
  if (!clean || clean.startsWith('/')) {
    return typeof window !== 'undefined' ? window.location.origin : ''
  }
  return clean.endsWith('/api') ? clean.slice(0, -4) : clean
}

const getFileUrl = (path) => {
  if (!path) return ''
  if (typeof path !== 'string') return ''
  if (path.startsWith('data:') || path.startsWith('blob:')) return path

  const baseUrl = getApiOrigin()
  if (path.startsWith('http')) {
    try {
      const u = new URL(path)
      const idxStorage = u.pathname.indexOf('/storage/')
      if (idxStorage !== -1) {
        const rel = u.pathname.slice(idxStorage + '/storage/'.length).replace(/^\/+/, '')
        return `${baseUrl}/api/public-files/${rel}`
      }
      const idxPublic = u.pathname.indexOf('/api/public-files/')
      if (idxPublic !== -1) {
        const rel = u.pathname.slice(idxPublic + '/api/public-files/'.length).replace(/^\/+/, '')
        return `${baseUrl}/api/public-files/${rel}`
      }
      return path
    } catch {
      return path
    }
  }

  let cleanPath = path
  if (cleanPath.startsWith('/storage/')) cleanPath = cleanPath.substring(9)
  else if (cleanPath.startsWith('storage/')) cleanPath = cleanPath.substring(8)
  else if (cleanPath.startsWith('/api/public-files/')) cleanPath = cleanPath.substring(17)
  else if (cleanPath.startsWith('api/public-files/')) cleanPath = cleanPath.substring(16)
  else if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1)
  return `${baseUrl}/api/public-files/${cleanPath}`
}

const isPdfUrl = (value) => typeof value === 'string' && value.toLowerCase().includes('.pdf')

const toUrl = (item) => {
  if (typeof item === 'string') return item.trim()
  if (item && typeof item === 'object') return String(item.path || item.url || item.src || '').trim()
  return ''
}

const uniqueUrls = (list) => {
  const seen = new Set()
  return (Array.isArray(list) ? list : [])
    .map(toUrl)
    .filter(Boolean)
    .filter((url) => {
      const key = url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const asList = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {}
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

const fileNameFromUrl = (url, fallback = 'document.pdf') => {
  try {
    const path = String(url).split('?')[0]
    const name = decodeURIComponent(path.split('/').pop() || '')
    return name || fallback
  } catch {
    return fallback
  }
}

const localize = (value, map, lang) => {
  if (value == null || value === '') return ''
  const key = String(value).trim()
  return map[key]?.[lang] || key
}

const localizeList = (value, map, lang) => {
  const parts = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts.map((part) => localize(part, map, lang)).filter(Boolean).join(' / ')
}

const displayValue = (value) => (value == null || value === '' ? '—' : String(value))

function SectionKicker({ kicker, title, light = false }) {
  return (
    <div className="mb-8">
      <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${light ? 'text-blue-200' : 'text-blue-600'}`}>
        {kicker}
      </div>
      <h2 className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${light ? 'text-white' : 'text-slate-900'}`}>
        {title}
      </h2>
    </div>
  )
}

const resolveInitialLang = (data) => {
  const normalize = (value) => {
    const raw = String(value || '').trim().toLowerCase()
    if (raw.startsWith('ar')) return 'ar'
    if (raw.startsWith('en')) return 'en'
    return ''
  }

  const fromPayload = normalize(data?.lang || data?.language)
  if (fromPayload) return fromPayload

  try {
    for (const key of ['language', 'lang', 'i18nextLng']) {
      const stored = normalize(window.localStorage.getItem(key))
      if (stored) return stored
    }
    const prefsRaw = window.localStorage.getItem('systemPrefs')
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw)
      const fromPrefs = normalize(prefs?.language)
      if (fromPrefs) return fromPrefs
    }
  } catch {}

  if (typeof document !== 'undefined') {
    const fromHtml = normalize(document.documentElement.lang)
    if (fromHtml) return fromHtml
  }
  if (typeof navigator !== 'undefined') {
    const fromNav = normalize(navigator.language)
    if (fromNav) return fromNav
  }
  return 'en'
}

export default function ShareLandingPage({ data }) {
  const [scrolled, setScrolled] = useState(false)
  const [lang, setLang] = useState(() => resolveInitialLang(data))
  const [lightbox, setLightbox] = useState('')
  const isRtl = lang === 'ar'
  const t = useMemo(() => ({
    ar: {
      projectInfo: 'معلومات المشروع',
      propertyInfo: 'معلومات الوحدة',
      projectName: 'اسم المشروع',
      country: 'الدولة',
      city: 'المدينة',
      category: 'التصنيف',
      spaceRange: 'نطاق المساحة',
      facilities: 'مرافق المشروع',
      gallery: 'المعرض',
      pdf: 'الكتيب',
      download: 'تنزيل الكتيب',
      title: 'العنوان',
      propertyType: 'نوع الوحدة',
      status: 'الحالة',
      unitDetails: 'تفاصيل الوحدة',
      area: 'المساحة',
      bedrooms: 'غرف النوم',
      bathrooms: 'الحمامات',
      finishing: 'التشطيب',
      view: 'الإطلالة',
      rightsReserved: 'جميع الحقوق محفوظة.',
      noImage: 'لا توجد بيانات للعرض',
      overview: 'نظرة عامة',
      brochureHint: 'حمّل ملف المشروع للاطلاع على التفاصيل الكاملة.',
    },
    en: {
      projectInfo: 'Project Information',
      propertyInfo: 'Property Information',
      projectName: 'Project Name',
      country: 'Country',
      city: 'City',
      category: 'Category',
      spaceRange: 'Space Range',
      facilities: 'Project Facilities',
      gallery: 'Gallery',
      pdf: 'Brochure',
      download: 'Download brochure',
      title: 'Title',
      propertyType: 'Property Type',
      status: 'Status',
      unitDetails: 'Unit Details',
      area: 'Area',
      bedrooms: 'Bedrooms',
      bathrooms: 'Bathrooms',
      finishing: 'Finishing',
      view: 'View',
      rightsReserved: 'All rights reserved.',
      noImage: 'Nothing to display',
      overview: 'Overview',
      brochureHint: 'Download the project file for the full details.',
    },
  })[lang], [lang])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const project = data?.project || null
  const property = data?.property || null
  const brandName = data?.companyName || data?.title || 'Brand'
  const logoCandidate = data?.companyLogo || data?.logo || ''
  const logo = project?.logo && logoCandidate === project.logo ? '' : logoCandidate

  const projectName = isRtl
    ? (project?.nameAr || project?.name || '')
    : (project?.name || project?.nameAr || '')
  const propertyTitle = isRtl
    ? (property?.adTitleAr || property?.nameAr || property?.name || data?.title || '')
    : (property?.adTitle || property?.name || data?.title || property?.adTitleAr || '')
  const propertyProjectName = property?.project || property?.projectName || ''
  const headline = project ? projectName : propertyTitle

  const projectCategory = localizeList(project?.categories?.length ? project.categories : project?.category, CATEGORY_LABELS, lang)
  const propertyCategory = localizeList(property?.category, CATEGORY_LABELS, lang)
  const propertyType = localize(property?.propertyType, PROPERTY_TYPE_LABELS, lang)
  const propertyStatus = localize(property?.status, PROPERTY_STATUS_LABELS, lang)
  const finishing = localize(property?.finishing, FINISHING_LABELS, lang)
  const view = localize(property?.view, VIEW_LABELS, lang)

  const amenities = asList(project?.amenities)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  const hasFacilities = amenities.length > 0

  const minSpace = Number(project?.minSpace || 0)
  const maxSpace = Number(project?.maxSpace || 0)
  const hasSpaceRange = Boolean(project && (minSpace || maxSpace))
  const spaceRangeText = minSpace && maxSpace
    ? `${minSpace} – ${maxSpace} m²`
    : `${minSpace || maxSpace} m²`

  const mainImage = project
    ? (project.image || data?.cover || '')
    : (property?.mainImage || data?.cover || '')

  const gallery = uniqueUrls(
    project
      ? (project.galleryImages || data?.media || [])
      : (property?.images || data?.media || [])
  ).filter((url) => !isPdfUrl(url) && url !== mainImage)

  const pdfs = uniqueUrls([
    ...(Array.isArray(data?.pdfs) ? data.pdfs : []),
    ...(Array.isArray(project?.pdfs) ? project.pdfs : []),
    ...(Array.isArray(project?.masterPlanImages) ? project.masterPlanImages : []),
    ...(Array.isArray(project?.cilAttachments) ? project.cilAttachments : []),
    ...(Array.isArray(property?.pdfs) ? property.pdfs : []),
    ...(Array.isArray(property?.documents) ? property.documents : []),
    ...(Array.isArray(property?.floorPlans) ? property.floorPlans : []),
  ]).filter(isPdfUrl)

  const areaValue = property?.area ?? property?.totalArea
  const areaText = areaValue === '' || areaValue == null
    ? '—'
    : `${areaValue} ${property.areaUnit || 'm²'}`

  const locationLine = project
    ? [project.city, project.country].filter(Boolean).join(', ')
    : [propertyProjectName, property?.city].filter(Boolean).join(' · ')

  const heroChips = project
    ? [project.country, project.city, projectCategory].filter(Boolean)
    : [propertyCategory, propertyType, propertyStatus].filter(Boolean)

  const facts = property
    ? [
        { label: t.title, value: propertyTitle },
        { label: t.projectName, value: propertyProjectName },
        { label: t.category, value: propertyCategory },
        { label: t.propertyType, value: propertyType },
        { label: t.status, value: propertyStatus },
      ]
    : [
        { label: t.projectName, value: projectName },
        { label: t.country, value: project?.country },
        { label: t.city, value: project?.city },
        { label: t.category, value: projectCategory },
      ]

  const unitFacts = property
    ? [
        { icon: FaRulerCombined, label: t.area, value: areaText },
        { icon: FaBed, label: t.bedrooms, value: property.bedrooms ?? property.rooms },
        { icon: FaBath, label: t.bathrooms, value: property.bathrooms },
        { icon: FaCheckCircle, label: t.finishing, value: finishing },
        { icon: FaEye, label: t.view, value: view },
      ]
    : []

  const openLightbox = (src) => setLightbox(getFileUrl(src))

  const headerSolid = scrolled || !mainImage
  const overlapCard = '-mt-10 rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.45)] md:p-8'

  return (
    <div className="min-h-screen bg-[#f6f4ef] font-sans text-slate-900" dir={isRtl ? 'rtl' : 'ltr'}>
      <header
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`fixed inset-x-0 top-0 z-50 w-full ${
          headerSolid
            ? 'border-b border-black/5 bg-white/95 shadow-sm backdrop-blur-xl'
            : 'bg-gradient-to-b from-black/70 via-black/25 to-transparent'
        }`}
      >
        <div className="flex h-[88px] w-full items-center justify-between px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3.5">
            {logo ? (
              <img
                src={getFileUrl(logo)}
                alt=""
                className={`h-14 w-14 shrink-0 rounded-full object-cover shadow-md ${headerSolid ? 'ring-2 ring-slate-200' : 'ring-2 ring-white/70'}`}
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-md">
                {(brandName || 'B').charAt(0).toUpperCase()}
              </div>
            )}
            <div className={`truncate text-xl font-bold tracking-tight md:text-2xl ${headerSolid ? 'text-slate-900' : 'text-white'}`}>
              {brandName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium ${
              headerSolid
                ? 'border border-slate-200 bg-white text-slate-700'
                : 'border border-white/25 bg-white/15 text-white backdrop-blur'
            }`}
          >
            <FaGlobe size={14} />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>

      {mainImage ? (
        <section className="relative min-h-[78vh] overflow-hidden">
          <img src={getFileUrl(mainImage)} alt={headline} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/20" />
          <div className="relative mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-end px-5 pb-20 pt-28">
            {locationLine && (
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
                <FaMapMarkerAlt className="text-blue-300" />
                {locationLine}
              </div>
            )}
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
              {headline || brandName}
            </h1>
            <div className="mt-5 flex flex-wrap gap-2">
              {heroChips.map((chip) => (
                <span key={chip} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-white/90 backdrop-blur">
                  {chip}
                </span>
              ))}
              {hasSpaceRange && (
                <span className="rounded-full bg-blue-500 px-3 py-1 text-sm font-medium text-white shadow-lg shadow-blue-900/30">
                  {spaceRangeText}
                </span>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-slate-950 px-5 pb-16 pt-32 text-white">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-4xl font-semibold md:text-6xl">{headline || brandName}</h1>
            {locationLine && <p className="mt-4 text-white/70">{locationLine}</p>}
          </div>
        </section>
      )}

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-8">
        {(project || property) && (
          <section className={overlapCard}>
            <SectionKicker kicker={t.overview} title={project ? t.projectInfo : t.propertyInfo} />
            <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${property ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-2xl bg-[#f6f4ef] px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{fact.label}</div>
                  <div className="mt-2 text-lg font-semibold leading-snug text-slate-900">{displayValue(fact.value)}</div>
                </div>
              ))}
            </div>
            {project && hasSpaceRange && (
              <div className="mt-6 border-t border-black/5 pt-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t.spaceRange}</div>
                <div className="mt-3 max-w-sm rounded-2xl bg-[#f6f4ef] px-4 py-4 text-lg font-semibold text-slate-900">
                  {spaceRangeText}
                </div>
              </div>
            )}
          </section>
        )}

        {property && (
          <section className="py-14">
            <SectionKicker kicker={t.unitDetails} title={t.unitDetails} />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {unitFacts.map((fact) => {
                const Icon = fact.icon
                return (
                  <div key={fact.label} className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <Icon />
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{fact.label}</div>
                    <div className="mt-2 text-xl font-semibold text-slate-900">{displayValue(fact.value)}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {hasFacilities && (
          <section className="py-14">
            <SectionKicker kicker={t.facilities} title={t.facilities} />
            <div className="flex flex-wrap gap-3">
              {amenities.map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm"
                >
                  <FaCheckCircle className="text-emerald-500" />
                  {localize(item, AMENITY_LABELS, lang)}
                </div>
              ))}
            </div>
          </section>
        )}

        {gallery.length > 0 && (
          <section className="py-14">
            <SectionKicker kicker={t.gallery} title={t.gallery} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
              {gallery.map((src, idx) => (
                <button
                  type="button"
                  key={`${src}-${idx}`}
                  onClick={() => openLightbox(src)}
                  className={`group relative overflow-hidden rounded-[28px] ${idx === 0 ? 'md:col-span-4 md:row-span-2 min-h-[320px]' : 'md:col-span-2 min-h-[180px]'}`}
                >
                  <img
                    src={getFileUrl(src)}
                    alt={`${t.gallery} ${idx + 1}`}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
                  <div className="absolute end-4 top-4 hidden h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow group-hover:flex">
                    <FaExpand size={12} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {pdfs.length > 0 && (
          <section className="py-6 pb-16">
            <div className="overflow-hidden rounded-[32px] bg-slate-950 p-8 text-white shadow-2xl md:p-10">
              <div className="flex  items-start justify-between gap-8 md:flex-row md:items-center">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">{t.pdf}</div>
                  <h3 className="mt-3 text-3xl font-semibold">{t.download}</h3>
                  <p className="mt-2 max-w-xl text-white/65">{t.brochureHint}</p>
                </div>
                <div className="flex w-full flex-col gap-3 md:w-auto">
                  {pdfs.map((src, idx) => {
                    const href = getFileUrl(src)
                    const name = fileNameFromUrl(src, `document-${idx + 1}.pdf`)
                    return (
                      <a
                        key={`${name}-${idx}`}
                        href={href}
                        download={name}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-5 py-3 font-semibold text-slate-900 transition hover:bg-blue-50"
                      >
                        <FaFilePdf className="text-rose-500" />
                        {t.download}
                        <FaDownload />
                      </a>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {!project && !property && (
          <div className="py-24 text-center text-slate-500">{t.noImage}</div>
        )}
      </main>

      <footer className="border-t border-black/5 py-8 text-center text-sm text-slate-400">
        &copy; {new Date().getFullYear()} {brandName}. {t.rightsReserved}
      </footer>

      {lightbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox('')}>
          <button
            type="button"
            className="absolute end-5 top-5 rounded-full bg-white/10 p-3 text-white"
            onClick={() => setLightbox('')}
          >
            <FaTimes />
          </button>
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-full rounded-3xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
