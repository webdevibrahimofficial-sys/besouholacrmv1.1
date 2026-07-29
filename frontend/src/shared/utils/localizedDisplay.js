const pickFirstString = (entity, keys = []) => {
  for (const key of keys) {
    const value = String(entity?.[key] ?? '').trim()
    if (value) return value
  }

  return ''
}

export const getLocalizedLabel = (
  entity,
  isArabic = false,
  {
    arabicKeys = ['name_ar', 'nameAr', 'title_ar', 'titleAr'],
    englishKeys = ['name', 'name_en', 'nameEn', 'title', 'label', 'value'],
  } = {}
) => {
  if (entity == null) return ''
  if (typeof entity === 'string') return entity.trim()

  const english = pickFirstString(entity, englishKeys)
  const arabic = pickFirstString(entity, arabicKeys)

  return isArabic ? (arabic || english) : (english || arabic)
}

export const mapLocalizedOption = (
  entity,
  {
    isArabic = false,
    valueKeys = ['id', 'name', 'name_en', 'nameEn', 'title', 'value'],
    arabicKeys,
    englishKeys,
  } = {}
) => {
  const label = getLocalizedLabel(entity, isArabic, { arabicKeys, englishKeys })
  const value = pickFirstString(entity, valueKeys)

  if (!label || !value) return null

  return { value, label }
}
