import { getLocalizedLabel } from './localizedDisplay'

export const getSourceCanonicalName = (source) => String(
  source?.name ||
  source?.name_en ||
  source?.title ||
  source?.value ||
  ''
).trim()

export const getSourceArabicName = (source) => String(
  source?.name_ar ||
  source?.nameAr ||
  ''
).trim()

export const getSourceDisplayName = (source, isArabic = false) => {
  if (!source || typeof source === 'string') {
    return String(source || '').trim()
  }

  return getLocalizedLabel(source, isArabic, {
    arabicKeys: ['name_ar', 'nameAr'],
    englishKeys: ['name', 'name_en', 'nameEn', 'title', 'value'],
  })
}

export const mapSourceToOption = (source, isArabic = false) => {
  const value = getSourceCanonicalName(source)
  const label = getSourceDisplayName(source, isArabic)

  if (!value || !label) return null

  return { value, label }
}
