export function isArabicNotificationLanguage(language) {
  const docLang = typeof document !== 'undefined' ? (document.documentElement?.lang || '') : ''
  return String(language || docLang || '').toLowerCase().startsWith('ar')
}

function isolateBidiText(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  return `\u2068${text}\u2069`
}

function translateLegacyTitle(title = '') {
  const normalized = String(title || '').trim()
  const titleMap = {
    'Lead Assigned': 'تم تعيين ليد',
    'Lead Created': 'تم إنشاء ليد',
    'New Lead Action': 'إجراء جديد على الليد',
    'New WhatsApp Message': 'رسالة واتساب جديدة',
    'Tenant created': 'تم إنشاء تينانت',
    'Tenant activated': 'تم تفعيل التينانت',
    'Backup failed': 'فشل النسخ الاحتياطي',
    'Payment failed': 'فشل الدفع',
    'Integration disconnected': 'تم فصل التكامل',
    'Meta reconnection required': 'مطلوب إعادة ربط ميتا',
    'Meta API rate limit reached': 'تم الوصول إلى حد ميتا',
    'Queue job failed': 'فشل مهمة في قائمة الانتظار',
    'Storage limit exceeded': 'تم تجاوز حد التخزين',
  }

  if (titleMap[normalized]) return titleMap[normalized]

  const commentMatch = normalized.match(/^New Comment on\s+(.+)$/i)
  if (commentMatch) {
    return `تعليق جديد على ${commentMatch[1]}`
  }

  return normalized
}

function translateLegacyBody(body = '') {
  const text = String(body || '').trim()
  if (!text) return ''

  let match = text.match(/^Lead '(.+)' has been assigned to (.+)\.$/i)
  if (match) {
    return `تم تعيين الليد ${isolateBidiText(`'${match[1]}'`)} إلى ${isolateBidiText(match[2])}.`
  }

  match = text.match(/^You created lead '(.+)'\.$/i)
  if (match) {
    return `لقد قمت بإنشاء الليد ${isolateBidiText(`'${match[1]}'`)}.`
  }

  match = text.match(/^Lead '(.+)' has been created by (.+)\.$/i)
  if (match) {
    return `تم إنشاء الليد ${isolateBidiText(`'${match[1]}'`)} بواسطة ${isolateBidiText(match[2])}.`
  }

  match = text.match(/^Task '(.+)' assigned to you\.$/i)
  if (match) {
    return `تم تعيين المهمة ${isolateBidiText(`'${match[1]}'`)} لك.`
  }

  match = text.match(/^Task '(.+)' has been updated by (.+)\.$/i)
  if (match) {
    return `تم تحديث المهمة ${isolateBidiText(`'${match[1]}'`)} بواسطة ${isolateBidiText(match[2])}.`
  }

  match = text.match(/^Task '(.+)' has expired\.$/i)
  if (match) {
    return `انتهت المهمة ${isolateBidiText(`'${match[1]}'`)}.`
  }

  match = text.match(/^New WhatsApp message from '(.+)':\s*(.+)$/i)
  if (match) {
    return `رسالة واتساب جديدة من ${isolateBidiText(`'${match[1]}'`)}: ${isolateBidiText(match[2])}`
  }

  return text
}

export function resolveNotificationText(payload = {}, options = {}) {
  const useArabic = !!options.useArabic
  const fallbackTitle = String(options.title || payload.title || payload.subject || '').trim()
  const fallbackBody = String(options.body || payload.message || payload.body || '').trim()

  if (useArabic) {
    return {
      title: payload.title_ar || payload.subject_ar || translateLegacyTitle(fallbackTitle) || 'إشعار',
      body: payload.message_ar || payload.body_ar || translateLegacyBody(fallbackBody) || '',
    }
  }

  return {
    title: fallbackTitle || payload.title_ar || payload.subject_ar || 'Notification',
    body: fallbackBody || payload.message_ar || payload.body_ar || '',
  }
}
