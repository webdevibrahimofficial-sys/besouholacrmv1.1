import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeProvider';
import { useAppState } from '../context/AppStateProvider';
import { FaUser, FaCheckCircle, FaMapMarkerAlt, FaSearch, FaEye, FaDownload, FaCalendarAlt, FaClock, FaPlus, FaUserCheck, FaEdit, FaEllipsisV, FaTimes, FaDollarSign, FaPaperclip, FaPhone, FaEnvelope, FaList, FaCog, FaTrash, FaChevronDown, FaComments, FaFilter, FaWhatsapp, FaFileAlt, FaCopy, FaSyncAlt, FaPaperPlane } from 'react-icons/fa';

import AddActionModal from '../../components/AddActionModal';
import EditLeadModal from '../../components/EditLeadModal';
import PaymentPlanModal from '../../components/PaymentPlanModal';
import CreateRequestModal from '../../components/CreateRequestModal';
import ReAssignLeadModal from './ReAssignLeadModal';
import LeadConvertToCustomerModal from './LeadConvertToCustomerModal';

import { useStages } from '@hooks/useStages';
import { saveRequest as saveRealEstateRequest } from '../../data/realEstateRequests';
import { saveRequest as saveInventoryRequest } from '../../data/inventoryRequests';
import { api } from '../../utils/api';
import { ensureEcho, getEcho } from '../../echo';
import { getLeadWhatsappMessages, sendWhatsappTemplate, sendWhatsappText, sendWhatsappMedia, getWhatsappTemplates, getWhatsappMirrorStatus, getWhatsappCapabilities } from '../../services/whatsappService';
import { getLeadEmailMessages, sendEmailText } from '../../services/emailService';
import { getEmailTemplates } from '../../services/emailTemplateService';
import { getLeadPermissionFlags } from '../../services/leadPermissions';
import { getPhoneDigits, getPhoneLines } from '../utils/phoneDisplay'
import { buildLeadTransferPayload } from '../utils/leadTransfer'
import { formatCrmDateTime, formatCrmCalendarDateTime, formatCrmDate } from '@shared/utils/crmDateTime'

const EnhancedLeadDetailsModal = ({ lead, isOpen, onClose, isArabic = false, theme: propTheme = 'light', assignees = [], usersList = [], onAssign, onUpdateLead, initialTab = 'all-actions', canAddAction: propCanAddAction, canShowCreator: propCanShowCreator, initialActionId, onImportHistory }) => {
  const { theme: contextTheme, resolvedTheme } = useTheme();
  const { user, company, crmSettings } = useAppState();
  const navigate = useNavigate();
  const theme = resolvedTheme || contextTheme || propTheme;
  const [activeTab, setActiveTab] = useState(initialTab);

  const [fetchedLead, setFetchedLead] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leadActions, setLeadActions] = useState([]);
  const [convertCustomerLoading, setConvertCustomerLoading] = useState(false);
  const [showConvertCustomerModal, setShowConvertCustomerModal] = useState(false);
  const [uploadingLeadAttachments, setUploadingLeadAttachments] = useState(false);
  const leadAttachmentInputRef = useRef(null);
  const [countriesList, setCountriesList] = useState([]);

  const reloadWhatsappMessages = useCallback(async (leadId) => {
    if (!leadId) return;
    try {
      const data = await getLeadWhatsappMessages(leadId);
      setWaMessages(Array.isArray(data) ? data : []);
    } catch {
      setWaMessages([]);
    }
  }, []);

  const loadWhatsappMirrorStatus = useCallback(async () => {
    try {
      const data = await getWhatsappMirrorStatus();
      setWaMirrorStatus(data || null);
    } catch {
      setWaMirrorStatus({ status: 'unknown' });
    }
  }, []);

  const loadWhatsappCapabilities = useCallback(async () => {
    try {
      const data = await getWhatsappCapabilities();
      setWhatsappCapabilities(data || { provider: 'meta', media_supported: true, templates_supported: true });
    } catch {
      setWhatsappCapabilities({ provider: 'meta', media_supported: true, templates_supported: true });
    }
  }, []);

  const formatCoordinatePair = (location) => {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return '-';
    }

    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };

  useEffect(() => {
    if (initialActionId && leadActions.length > 0) {
      const actionExists = leadActions.find(a => a.id == initialActionId);
      if (actionExists) {
        if (activeTab !== 'all-actions') {
          setActiveTab('all-actions');
        }
        
        setExpandedComments(prev => ({
          ...prev,
          [initialActionId]: true
        }));

        setTimeout(() => {
          const element = document.getElementById(`action-${initialActionId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-emerald-500', 'transition-all', 'duration-500');
            setTimeout(() => element.classList.remove('ring-2', 'ring-emerald-500'), 3000);
          }
        }, 500);
      }
    }
  }, [initialActionId, leadActions, activeTab]);

  useEffect(() => {
    if (isOpen && lead?.id) {
      setLoading(true);
      setError(null);
      api.get(`/api/leads/${lead.id}`)
        .then(response => {
          setFetchedLead(response.data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch lead details:', err);
          setError('Failed to load data');
          setLoading(false);
        });
    } else {
      setFetchedLead(null);
    }
  }, [isOpen, lead?.id]);

  useEffect(() => {
    if (!isOpen) return;
    api.get('/api/countries?active=1')
      .then((res) => {
        setCountriesList(Array.isArray(res?.data) ? res.data : (res?.data?.data || []));
      })
      .catch(() => {
        setCountriesList([]);
      });
  }, [isOpen]);

  const showToast = (type, message) => {
    try {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message } }));
    } catch { }
  };

  const getApiErrorMessage = (error, fallbackMessage) => {
    const data = error?.response?.data;
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }

    const validationMessages = data?.errors && typeof data.errors === 'object'
      ? Object.values(data.errors).flat().filter(Boolean)
      : [];

    if (validationMessages.length > 0) {
      return validationMessages.join(' ');
    }

    return fallbackMessage;
  };

  const handlePickLeadAttachments = () => {
    if (uploadingLeadAttachments) return;
    leadAttachmentInputRef.current?.click();
  };

  const handleLeadAttachmentsSelected = async (e) => {
    const files = Array.from(e?.target?.files || []);
    if (e?.target) e.target.value = '';
    if (!lead?.id || files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => formData.append('attachments[]', file));

    setUploadingLeadAttachments(true);
    showToast('info', isArabic ? 'جاري رفع المرفقات...' : 'Uploading attachments...');

    try {
      const res = await api.post(`/api/leads/${lead.id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const updated = res?.data;
      if (updated) {
        setFetchedLead(updated);
        onUpdateLead?.(updated);
      }

      showToast('success', isArabic ? 'تم رفع المرفقات بنجاح' : 'Attachments uploaded');
      if (activeTab !== 'attachments') setActiveTab('attachments');
    } catch (err) {
      console.error('Failed to upload lead attachments:', err);
      showToast('error', isArabic ? 'فشل رفع المرفقات' : 'Failed to upload attachments');
    } finally {
      setUploadingLeadAttachments(false);
    }
  };


  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  useEffect(() => {
    if (!isOpen || activeTab !== 'communication' || !lead?.id) return;
    setWaLoading(true);
    reloadWhatsappMessages(lead.id)
      .finally(() => setWaLoading(false));
    loadWhatsappMirrorStatus();
    loadWhatsappCapabilities();
    setEmailLoading(true);
    getLeadEmailMessages(lead.id)
      .then(data => {
        setEmailMessages(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setEmailMessages([]);
      })
      .finally(() => setEmailLoading(false));
    setTplLoading(true);
    getWhatsappTemplates()
      .then(data => {
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setTemplates([]);
      })
      .finally(() => setTplLoading(false));
    getEmailTemplates()
      .then(list => setEmailTemplates(Array.isArray(list) ? list : []))
      .catch(() => { });
  }, [isOpen, activeTab, lead?.id, loadWhatsappCapabilities, loadWhatsappMirrorStatus, reloadWhatsappMessages]);
  useEffect(() => {
    if (!isOpen) return;
    const tenantId = user?.tenant_id || company?.tenant_id || company?.tenantId || company?.id;
    if (!tenantId) return;
    const channelName = `tenant-${tenantId}-whatsapp`;
    const echoInstance = getEcho() || ensureEcho() || window.Echo;
    try {
      if (echoInstance) {
        const ch = echoInstance.channel(channelName);
        ch.listen('InboundWhatsappMessage', (e) => {
          const m = e?.message;
          if (!m) return;
          if (lead?.id && m.lead_id && String(m.lead_id) === String(lead.id)) {
            reloadWhatsappMessages(lead.id);
            if (activeTab !== 'communication') {
              setUnreadComm(c => c + 1);
            }
            return;
          }
          const rawPhones = [lead?.phone, lead?.mobile].filter(Boolean).join('\n');
          const digitsCandidates = getPhoneLines(rawPhones, {
            showFull: true,
            defaultCountryCode: getLeadDefaultCountryCode(effectiveLead),
          })
            .map((line) => String(line?.digits || '').trim())
            .filter(Boolean);
          const messageDigits = [m.from, m.to].map((value) => String(value || '').replace(/[^0-9]/g, ''));
          const normalizedLeadDigits = digitsCandidates.flatMap((digits) => {
            const variants = [digits];
            if (digits.startsWith('20') && digits.length > 2) {
              variants.push(`0${digits.slice(2)}`, digits.slice(2));
            }
            if (digits.startsWith('0') && digits.length > 1) {
              variants.push(`20${digits.slice(1)}`, digits.slice(1));
            }
            return variants;
          });
          const hasPhoneMatch = messageDigits.some((value) => value && normalizedLeadDigits.includes(value));
          if (hasPhoneMatch) {
            if (lead?.id) {
              reloadWhatsappMessages(lead.id);
            }
            if (activeTab !== 'communication') {
              setUnreadComm(c => c + 1);
            }
          }
        });
      }
    } catch { }
    return () => {
      try {
        if (echoInstance) {
          echoInstance.leave(channelName);
        }
      } catch { }
    };
  }, [isOpen, user?.tenant_id, company?.id, company?.tenant_id, company?.tenantId, lead?.id, lead?.phone, lead?.mobile, activeTab, reloadWhatsappMessages]);
  useEffect(() => {
    if (!isOpen || activeTab !== 'communication' || !lead?.id) return;
    let timer = null;
    const shouldPoll = !(getEcho() || window.Echo);
    if (shouldPoll) {
      const run = async () => {
        try {
          await reloadWhatsappMessages(lead.id);
          const edata = await getLeadEmailMessages(lead.id);
          if (Array.isArray(edata)) {
            setEmailMessages(edata);
          }
        } catch { }
      };
      timer = setInterval(run, 5000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, activeTab, lead?.id, reloadWhatsappMessages]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedComments, setExpandedComments] = useState({});

  useEffect(() => {
    if (!isOpen || !lead?.id) return;
    
    // Listen for real-time comment updates
    let channel = null;
    try {
      // Assuming we have access to echo via context or prop, but here it seems we might need to access it differently.
      // If echo is not available in props, we might need to use window.Echo if set globally, or import it.
      // The code above uses `echo` variable, let's see where it comes from.
      // It seems it is likely from props or context.
      // Let's assume `echo` is available in scope as seen in line 92.
      
      if (window.Echo) {
         channel = window.Echo.private(`leads.${lead.id}`);
         channel.listen('.comment.added', (e) => {
            if (e && e.action_id && e.comment) {
                // Determine if the comment is from the current user to avoid self-notification/toast
                // (Though usually we want to see our own comment appear, we don't need a toast for it)
                const isMine = String(e.comment.userId) === String(user?.id);

                setLeadActions(prevActions => {
                    return prevActions.map(action => {
                        if (action.id === e.action_id) {
                            const currentComments = action.comments || [];
                            // Avoid duplicates if we optimistically added it
                            const exists = currentComments.some(c => c.id === e.comment.id || (c.text === e.comment.text && c.createdAt === e.comment.createdAt));
                            if (exists) return action;

                            // Add the new comment
                            return {
                                ...action,
                                comments: [...currentComments, e.comment]
                            };
                        }
                        return action;
                    });
                });
                
                // Show toast notification if it's not my comment
                if (!isMine) {
                    const event = new CustomEvent('app:toast', {
                        detail: {
                            type: 'info',
                            message: isArabic 
                                ? `تعليق جديد من ${e.comment.user}` 
                                : `New comment from ${e.comment.user}`
                        }
                    });
                    window.dispatchEvent(event);
                }
            }
         });
      }
    } catch (err) {
        console.error('Failed to subscribe to lead channel', err);
    }

    return () => {
        if (channel) {
            channel.stopListening('.comment.added');
        }
    };
  }, [isOpen, lead?.id]);
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [viewMode, setViewMode] = useState('timeline');
  const [selectedActions, setSelectedActions] = useState([]);
  const [showAddActionModal, setShowAddActionModal] = useState(false);
  // showAttachmentsModal removed
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [showPaymentPlanModal, setShowPaymentPlanModal] = useState(false);
  const [waMessages, setWaMessages] = useState([]);
  const waMessagesContainerRef = useRef(null);

  useEffect(() => {
    const el = waMessagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [waMessages]);
  const [waLoading, setWaLoading] = useState(false);
  const [waMirrorStatus, setWaMirrorStatus] = useState(null);
  const [whatsappCapabilities, setWhatsappCapabilities] = useState({ provider: 'meta', media_supported: true, templates_supported: true });
  const [emailMessages, setEmailMessages] = useState([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [sendingTpl, setSendingTpl] = useState('');
  const [textBody, setTextBody] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [selectedWhatsappAttachment, setSelectedWhatsappAttachment] = useState(null);
  const [showWhatsappEmojiPicker, setShowWhatsappEmojiPicker] = useState(false);
  const [showWhatsappTemplatePicker, setShowWhatsappTemplatePicker] = useState(false);
  const whatsappAttachmentInputRef = useRef(null);
  const whatsappEmojiPickerRef = useRef(null);
  const whatsappTemplatePickerRef = useRef(null);
  const whatsappMessageInputRef = useRef(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [unreadComm, setUnreadComm] = useState(0);
  const [showCreateRequestModal, setShowCreateRequestModal] = useState(false);
  const [actionType, setActionType] = useState('call');
  const [commFilter, setCommFilter] = useState('all');
  const whatsappEmojiGroups = [
    {
      key: 'faces',
      label: isArabic ? 'الوجوه' : 'Faces',
      items: ['😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩'],
    },
    {
      key: 'gestures',
      label: isArabic ? 'التفاعل' : 'Reactions',
      items: ['😉', '🙂', '😇', '🤗', '🙌', '👍', '👏', '🙏', '💪', '👌'],
    },
    {
      key: 'love',
      label: isArabic ? 'المشاعر' : 'Feelings',
      items: ['❤️', '💚', '💙', '💜', '🧡', '🔥', '✨', '🎉', '💯', '✅'],
    },
    {
      key: 'business',
      label: isArabic ? 'الأعمال' : 'Business',
      items: ['📞', '📩', '📎', '📝', '💬', '🚀', '🌟', '🎯', '💡', '🤝'],
    },
  ];
  const whatsappEmojis = ['😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '✅', '❤️', '📞', '📎', '😊'];
  const whatsappAttachmentPreviewUrl = useMemo(() => {
    if (!selectedWhatsappAttachment) return '';
    return URL.createObjectURL(selectedWhatsappAttachment);
  }, [selectedWhatsappAttachment]);

  useEffect(() => {
    return () => {
      if (whatsappAttachmentPreviewUrl) {
        URL.revokeObjectURL(whatsappAttachmentPreviewUrl);
      }
    };
  }, [whatsappAttachmentPreviewUrl]);

  useEffect(() => {
    if (!showWhatsappEmojiPicker) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (whatsappEmojiPickerRef.current?.contains(event.target)) {
        return;
      }
      setShowWhatsappEmojiPicker(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showWhatsappEmojiPicker]);

  useEffect(() => {
    if (!showWhatsappTemplatePicker) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (whatsappTemplatePickerRef.current?.contains(event.target)) {
        return;
      }
      setShowWhatsappTemplatePicker(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showWhatsappTemplatePicker]);

  const handleWhatsappAttachmentPick = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedWhatsappAttachment(file);
  };

  const clearWhatsappAttachment = () => {
    setSelectedWhatsappAttachment(null);
    if (whatsappAttachmentInputRef.current) {
      whatsappAttachmentInputRef.current.value = '';
    }
  };

  const mediaAttachmentsSupported = whatsappCapabilities?.media_supported !== false;
  const whatsappTemplatesSupported = whatsappCapabilities?.templates_supported !== false;
  const whatsappProviderLabel = whatsappCapabilities?.provider === 'mirror'
    ? 'WhatsApp Mirror'
    : 'Meta WhatsApp';

  const handleWhatsappAttachmentButtonClick = () => {
    if (!mediaAttachmentsSupported) {
      showToast(
        'error',
        isArabic
          ? 'إرسال المرفقات متاح فقط عند استخدام مزود واتساب Meta.'
          : 'Attachments are available only when the active WhatsApp provider is Meta.'
      );
      return;
    }

    whatsappAttachmentInputRef.current?.click();
  };

  const appendWhatsappEmoji = (emoji) => {
    setTextBody((prev) => `${prev || ''}${emoji}`);
    setShowWhatsappEmojiPicker(false);
  };

  const applyWhatsappTemplateToComposer = (template) => {
    const nextBody = String(template?.body || '').trim();
    if (!nextBody) {
      return;
    }

    setTextBody(nextBody);
    setShowWhatsappTemplatePicker(false);

    requestAnimationFrame(() => {
      whatsappMessageInputRef.current?.focus();
      const textLength = nextBody.length;
      whatsappMessageInputRef.current?.setSelectionRange?.(textLength, textLength);
    });
  };

  const getWhatsappMessageText = (message) => {
    if (message?.body) {
      return message.body;
    }

    if (message?.media?.caption) {
      return message.media.caption;
    }

    if (message?.media?.filename) {
      return message.media.filename;
    }

    if (message?.media?.url) {
      return '';
    }

    return message?.direction === 'inbound'
      ? (isArabic ? '[رسالة وسائط بدون نص]' : '[Media message]')
      : (isArabic ? '[بدون نص]' : '[No text]');
  };

  const renderWhatsappMessageMedia = (message) => {
    const media = message?.media;
    if (!media?.url) {
      return null;
    }

    if (media.type === 'image') {
      return (
        <a href={media.url} target="_blank" rel="noreferrer">
          <img
            src={media.url}
            alt={media.filename || 'WhatsApp image'}
            className="mb-2 max-h-56 w-full rounded-lg object-cover"
          />
        </a>
      );
    }

    if (media.type === 'video') {
      return (
        <video controls className="mb-2 max-h-56 w-full rounded-lg bg-black">
          <source src={media.url} type={media.mime_type || 'video/mp4'} />
        </video>
      );
    }

    if (media.type === 'audio') {
      return (
        <audio controls className="mb-2 w-full">
          <source src={media.url} type={media.mime_type || 'audio/mpeg'} />
        </audio>
      );
    }

    return (
      <a
        href={media.url}
        target="_blank"
        rel="noreferrer"
        className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          isLight ? 'border-gray-200 bg-white/80 text-slate-700' : 'border-slate-600 bg-slate-800/80 text-white'
        }`}
      >
        <FaFileAlt className="shrink-0" />
        <span className="truncate">{media.filename || (isArabic ? 'مرفق' : 'Attachment')}</span>
      </a>
    );
  };

  const handleSendWhatsappMessage = async () => {
    if (sendingText) return;

    const raw = lead?.phone || lead?.mobile || '';
    const digits = getPhoneDigits(raw, {
      defaultCountryCode: getLeadDefaultCountryCode(effectiveLead),
    });

    if (!digits) {
      showToast('error', isArabic ? 'رقم الواتساب غير صالح' : 'Invalid WhatsApp number');
      return;
    }

    if (!textBody.trim() && !selectedWhatsappAttachment) {
      return;
    }

    if (selectedWhatsappAttachment && !mediaAttachmentsSupported) {
      showToast(
        'error',
        isArabic
          ? 'المرفقات غير مدعومة مع مزود واتساب الحالي. احذف المرفق أو بدّل المزود إلى Meta.'
          : 'Attachments are not supported with the active WhatsApp provider. Remove the file or switch the provider to Meta.'
      );
      return;
    }

    setSendingText(true);
    try {
      const latestChannelId = [...waMessages]
        .reverse()
        .find((m) => m?.channel_id != null)?.channel_id ?? null;
      const sendOptions = {
        lead_id: lead?.id ?? null,
        ...(latestChannelId != null ? { channel_id: latestChannelId } : {}),
      };

      let res;
      if (selectedWhatsappAttachment) {
        res = await sendWhatsappMedia({
          recipient_number: digits,
          attachment: selectedWhatsappAttachment,
          caption: textBody.trim(),
          ...sendOptions,
        });
      } else {
        res = await sendWhatsappText({
          recipient_number: digits,
          message_body: textBody.trim(),
          ...sendOptions,
        });
      }

      const ok = !!(res?.ok || res?.success);
      if (ok && lead?.id) {
        await reloadWhatsappMessages(lead.id);
        setTextBody('');
        clearWhatsappAttachment();
        setShowWhatsappEmojiPicker(false);
      } else {
        showToast('error', isArabic ? 'فشل إرسال الرسالة' : 'Failed to send message');
      }
    } catch (error) {
      showToast(
        'error',
        getApiErrorMessage(
          error,
          isArabic ? 'فشل إرسال الرسالة أو المرفق' : 'Failed to send message or attachment'
        )
      );
    } finally {
      setSendingText(false);
    }
  };
  const refreshWhatsappChat = useCallback(async () => {
    if (!lead?.id || waLoading) return;
    setWaLoading(true);
    try {
      await Promise.all([
        reloadWhatsappMessages(lead.id),
        loadWhatsappMirrorStatus(),
        loadWhatsappCapabilities(),
      ]);
    } finally {
      setWaLoading(false);
    }
  }, [lead?.id, loadWhatsappCapabilities, loadWhatsappMirrorStatus, reloadWhatsappMessages, waLoading]);

  useEffect(() => {
    if (mediaAttachmentsSupported || !selectedWhatsappAttachment) {
      return;
    }

    clearWhatsappAttachment();
  }, [mediaAttachmentsSupported, selectedWhatsappAttachment]);
  const showWhatsAppSection = commFilter !== 'email';
  const showEmailSection = commFilter !== 'whatsapp';
  const waMirrorIsConnected = waMirrorStatus?.status === 'connected';
  const waMirrorWarning =
    waMirrorStatus && !waMirrorIsConnected
      ? (isArabic
        ? 'جلسة واتساب غير مستقرة حالياً. قد يسجل الـ CRM الرسالة لكن بدون تأكيد تسليم فعلي من واتساب.'
        : 'WhatsApp session is currently unstable. The CRM may record the message before WhatsApp confirms real delivery.')
      : null;
  const getWhatsappStatusLabel = (status) => {
    switch (status) {
      case 'sent_to_baileys':
        return isArabic ? 'تم الإرسال إلى الجلسة' : 'sent to session';
      case 'delivered':
        return isArabic ? 'تم التسليم' : 'delivered';
      case 'read':
        return isArabic ? 'تمت القراءة' : 'read';
      case 'received':
        return isArabic ? 'مستلمة' : 'received';
      case 'failed':
        return isArabic ? 'فشل الإرسال' : 'failed';
      case 'unstable':
        return isArabic ? 'غير مؤكدة / الجلسة غير مستقرة' : 'unstable / not confirmed';
      default:
        return status || (isArabic ? 'غير معروف' : 'unknown');
    }
  };
  const [showCompose, setShowCompose] = useState(false);
  const [composeChannel, setComposeChannel] = useState('whatsapp');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeText, setComposeText] = useState('');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showReAssignModal, setShowReAssignModal] = useState(false);
  const [assignStep, setAssignStep] = useState('teams');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [checkInHistory, setCheckInHistory] = useState([]);
  const [commentInputs, setCommentInputs] = useState({});
  const [commentSubmitting, setCommentSubmitting] = useState({});

  const leadPermissionFlags = getLeadPermissionFlags(user);
  const modulePermissions = (user?.meta_data && user.meta_data.module_permissions) || {};
  const controlModulePerms = Array.isArray(modulePermissions.Control) ? modulePermissions.Control : [];
  const roleLowerForAssign = String(user?.role || '').toLowerCase();
  const isTenantAdminForAssign =
    roleLowerForAssign === 'admin' ||
    roleLowerForAssign === 'tenant admin' ||
    roleLowerForAssign === 'tenant-admin';
  const canAssignLeads =
    user?.is_super_admin ||
    isTenantAdminForAssign ||
    controlModulePerms.includes('assignLeads');
  const canShowCreatorPermission =
    typeof propCanShowCreator === 'boolean' ? propCanShowCreator : leadPermissionFlags.canShowCreator;
  const communicationStats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const normalizeMessages = (messages, channel) =>
      (Array.isArray(messages) ? messages : [])
        .map((message, index) => {
          const timestampValue = message?.timestamp ? new Date(message.timestamp).getTime() : NaN;
          return {
            id: message?.id || `${channel}-${index}`,
            channel,
            direction: String(message?.direction || '').toLowerCase(),
            timestamp: Number.isFinite(timestampValue) ? timestampValue : null,
          };
        })
        .filter((message) => message.timestamp);

    const getChannelStats = (messages, channel) => {
      const normalized = normalizeMessages(messages, channel).sort((a, b) => a.timestamp - b.timestamp);
      const inboundMessages = normalized.filter((message) => message.direction === 'inbound');
      const outboundMessages = normalized.filter((message) => message.direction === 'outbound');
      const respondedInboundMessages = [];
      const responseTimesInMinutes = [];

      inboundMessages.forEach((inboundMessage) => {
        const outboundReply = outboundMessages.find((message) => message.timestamp > inboundMessage.timestamp);
        if (!outboundReply) return;
        respondedInboundMessages.push(inboundMessage);
        responseTimesInMinutes.push((outboundReply.timestamp - inboundMessage.timestamp) / (1000 * 60));
      });

      return {
        channel,
        totalMessages: normalized.length,
        weeklyMessages: normalized.filter((message) => message.timestamp >= weekAgo).length,
        inboundCount: inboundMessages.length,
        outboundCount: outboundMessages.length,
        respondedInboundCount: respondedInboundMessages.length,
        responseRate: inboundMessages.length > 0 ? (respondedInboundMessages.length / inboundMessages.length) * 100 : 0,
        averageResponseMinutes:
          responseTimesInMinutes.length > 0
            ? responseTimesInMinutes.reduce((sum, value) => sum + value, 0) / responseTimesInMinutes.length
            : null,
      };
    };

    const whatsappStats = getChannelStats(waMessages, 'whatsapp');
    const emailStats = getChannelStats(emailMessages, 'email');
    const channelStats = [whatsappStats, emailStats];
    const channelsWithMessages = channelStats.filter((stats) => stats.totalMessages > 0);
    const bestChannelStats = channelsWithMessages.sort((left, right) => {
      if (right.responseRate !== left.responseRate) return right.responseRate - left.responseRate;
      return right.totalMessages - left.totalMessages;
    })[0] || null;

    const allResponseTimes = channelStats
      .map((stats) => stats.averageResponseMinutes)
      .filter((value) => value !== null);

    const averageResponseMinutes =
      allResponseTimes.length > 0
        ? allResponseTimes.reduce((sum, value) => sum + value, 0) / allResponseTimes.length
        : null;

    return {
      bestChannelStats,
      averageResponseMinutes,
      weeklyInteractions: whatsappStats.weeklyMessages + emailStats.weeklyMessages,
    };
  }, [waMessages, emailMessages]);
  const formatAverageResponseTime = (minutes) => {
    if (minutes === null || Number.isNaN(minutes)) {
      return isArabic ? 'لا توجد بيانات' : 'No data';
    }
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    if (minutes < 24 * 60) {
      return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)}h`;
    }
    return `${(minutes / (24 * 60)).toFixed(1)}d`;
  };
  const bestChannelLabel = communicationStats.bestChannelStats
    ? communicationStats.bestChannelStats.channel === 'whatsapp'
      ? 'WhatsApp'
      : 'Email'
    : (isArabic ? 'لا توجد بيانات' : 'No data');
  const bestChannelRateLabel = communicationStats.bestChannelStats
    ? `${Math.round(communicationStats.bestChannelStats.responseRate)}% ${isArabic ? 'نسبة الرد' : 'Response Rate'}`
    : (isArabic ? 'لا توجد تفاعلات' : 'No interactions yet');
  const allAttachments = useMemo(() => {
    const list = [];
    const currentLead = fetchedLead || lead;
    
    // 1. Lead Attachments
    const leadAtts = currentLead?.attachments || [];
    if (Array.isArray(leadAtts)) {
      leadAtts.forEach(path => list.push({ 
        path, 
        source: isArabic ? 'الملف الشخصي' : 'Lead Profile', 
        date: currentLead.created_at 
      }));
    }

    // 2. Action Attachments
    // Use leadActions state if populated, otherwise fallback to currentLead.actions
    const actions = (leadActions.length > 0 ? leadActions : (currentLead?.actions || []));
    
    if (Array.isArray(actions)) {
      actions.forEach(action => {
        let details = action.details || {};
        // If details is mixed into the action object (transformedAction), use action itself
        if (!action.details && (action.proposalAttachment || action.rentAttachment || action.attachments)) {
            details = action;
        }
        
        if (typeof details === 'string') {
            try { details = JSON.parse(details); } catch(e) {}
        }
        
        if (details.proposalAttachment) {
           list.push({ 
             path: details.proposalAttachment, 
             source: isArabic ? 'عرض سعر' : 'Proposal', 
             date: action.created_at || action.date,
             actionId: action.id
           });
        }
        
        if (details.rentAttachment) {
           list.push({ 
             path: details.rentAttachment, 
             source: isArabic ? 'عقد إيجار' : 'Rent Contract', 
             date: action.created_at || action.date,
             actionId: action.id
           });
        }

        if (Array.isArray(details.attachments)) {
           details.attachments.forEach(path => {
             list.push({ 
               path, 
               source: action.action_type || action.type || 'Action', 
               date: action.created_at || action.date,
               actionId: action.id
             });
           });
        }
      });
    }
    
    return list.map((item) =>
      String(item.path || '').includes('lead-leak-report-')
        ? {
            ...item,
            source: isArabic ? 'تقرير تشخيص المبيعات' : 'Sales Leakage Audit',
          }
        : item
    );
  }, [fetchedLead, lead, leadActions, isArabic]);

  const effectiveLead = fetchedLead || lead || {};
  const leadLeakDiagnostic = effectiveLead?.meta_data?.lead_leak_detector;
  const permissions = effectiveLead.permissions || {};
  const companyTypeLower = String(
    company?.company_type ||
    company?.companyType ||
    effectiveLead?.company_type ||
    effectiveLead?.companyType ||
    ''
  ).toLowerCase().trim();
  const isRealEstateTenant = companyTypeLower === 'real estate' || companyTypeLower === 'real_estate' || companyTypeLower === 'realestate';
  
  // Lead Ownership Logic
  const currentUserId = user?.id;
  const roleLower = String(user?.role || '').toLowerCase();
  const isSalesPersonUser =
    roleLower.includes('sales person') ||
    roleLower.includes('salesperson') ||
    roleLower.includes('sales_person');

  // Ownership MUST be based on the real assignment id, not display fields like `sales_person` (string).
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

  const assignedToId = pickNumericId(
    effectiveLead.assigned_to_id,
    effectiveLead.assignedSalesId,
    effectiveLead.assigned_sales_id,
    effectiveLead.salesPersonId,
    effectiveLead.sales_person_id,
    effectiveLead.employeeId,
    effectiveLead.employee_id,
    effectiveLead.assigneeId,
    effectiveLead.assignee_id,
    effectiveLead.assignedUserId,
    effectiveLead.assigned_user_id,
    effectiveLead.assigned_to,
    effectiveLead.assignedTo,
    effectiveLead.assignedAgent?.id,
    effectiveLead.assigned_agent?.id,
    effectiveLead.assigned_sales
  );

  const assignedToName =
    (typeof effectiveLead.assigned_to === 'object' ? effectiveLead.assigned_to?.name : '') ||
    (typeof effectiveLead.assignedTo === 'object' ? effectiveLead.assignedTo?.name : '') ||
    (typeof effectiveLead.assignedAgent === 'object' ? effectiveLead.assignedAgent?.name : '') ||
    (typeof effectiveLead.assigned_agent === 'object' ? effectiveLead.assigned_agent?.name : '') ||
    effectiveLead?.sales_person_name ||
    effectiveLead?.salesPersonName ||
    effectiveLead?.employee_name ||
    effectiveLead?.employeeName ||
    effectiveLead?.assigned_to_name ||
    effectiveLead?.assignedToName ||
    (typeof effectiveLead?.sales_person === 'string' && isNaN(Number(effectiveLead?.sales_person)) ? effectiveLead?.sales_person : '') ||
    '';

  const createdById = pickNumericId(
    effectiveLead.created_by,
    effectiveLead.createdBy,
    effectiveLead.created_by_id,
    effectiveLead.creator_id,
    effectiveLead.creator?.id,
    effectiveLead.creatorId
  );

  const normalizeName = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

  const isOwner = Boolean(
    (assignedToId && currentUserId && String(assignedToId) === String(currentUserId)) ||
    (!assignedToId && assignedToName && user?.name && normalizeName(assignedToName) === normalizeName(user?.name)) ||
    (!assignedToId && isSalesPersonUser && createdById && currentUserId && String(createdById) === String(currentUserId))
  );

  const canEditInfo = (() => {
    if (!leadPermissionFlags.canEditInfo) return false;
    if (permissions?.is_referral_supervisor) return false;
    if (permissions.can_edit === false) return false;

    // UX rule: `editInfo` permission controls edit visibility/usage.
    // Backend remains the source of truth for authorization.
    return true;
  })();

  const canEditPhone = (() => {
    if (!leadPermissionFlags.canEditPhone) return false;
    if (permissions?.is_referral_supervisor) return false;
    if (permissions.can_edit === false) return false;

    return true;
  })();

  const canAddAction = useMemo(() => {
    if (showAddActionModal) return false;

    const parentAllowsAction = propCanAddAction !== false;
    if (!parentAllowsAction) return false;

    // Backend is the source of truth for action authorization.
    if (typeof permissions?.can_add_action === 'boolean') {
      return permissions.can_add_action;
    }

    return false;
  }, [showAddActionModal, propCanAddAction, permissions]);

  const AddActionIconButton = ({ visible, onClick }) => {
    if (!visible) return null;
    return (
      <button
        onClick={onClick}
        aria-label={isArabic ? 'إضافة إجراء' : 'Add Action'}
        title={isArabic ? 'إضافة إجراء' : 'Add Action'}
        className="btn-icon bg-emerald-500 hover:bg-emerald-600 text-white"
      >
        <FaPlus className="text-sm" />
      </button>
    );
  };

  const canConvertToCustomer = (() => {
    if (permissions.can_edit === false) return false;
    // Strict Rule: Only Lead Owner can convert
    return isOwner && crmSettings?.allowConvertToCustomers !== false;
  })();

  const doConvertToCustomer = async () => {
    if (!lead?.id) return;
    if (convertCustomerLoading) return;

    if (isRealEstateTenant) {
      setShowHeaderMenu(false);
      setShowConvertCustomerModal(true);
      return;
    }

    const ok = window.confirm(isArabic ? 'هل تريد تحويل هذا الليد إلى عميل؟' : 'Convert this lead to a customer?');
    if (!ok) return;

    setConvertCustomerLoading(true);
    try {
      let customerId = null;

      if (isRealEstateTenant) {
        const res = await api.post(`/api/cc/leads/${encodeURIComponent(lead.id)}/convert-to-customer`);
        customerId = res?.data?.customer?.id || null;
      } else {
        const sourceLead = effectiveLead || lead || {};
        const name = String(sourceLead?.name || sourceLead?.company || '').trim();
        const phone = String(sourceLead?.phone || '').trim();
        if (!name || !phone || phone.length < 5) {
          throw new Error('Conversion failed: missing name/phone');
        }

        const tagsArr = Array.isArray(sourceLead?.tags)
          ? sourceLead.tags
          : (sourceLead?.tags ? String(sourceLead.tags).split(',').map((s) => s.trim()).filter(Boolean) : (sourceLead?.source ? [String(sourceLead.source)] : []));

        const payload = {
          name,
          phone,
          email: String(sourceLead?.email || '').trim(),
          type: String(sourceLead?.type || (sourceLead?.company ? 'Company' : 'Individual')),
          companyName: sourceLead?.company || '',
          country: String(sourceLead?.country || '').trim(),
          city: String(sourceLead?.city || '').trim(),
          addressLine: String(sourceLead?.address || '').trim(),
          contacts: sourceLead?.company ? [{
            name: String(sourceLead?.name || '').trim(),
            phone: String(sourceLead?.phone || '').trim(),
            email: String(sourceLead?.email || '').trim(),
          }] : [],
          tags: tagsArr,
          notes: String(sourceLead?.notes || '').trim(),
          assignedSalesRep: String(sourceLead?.sales || sourceLead?.salesPerson || sourceLead?.assignedTo || '').trim(),
        };

        const res = await api.post('/api/customers', payload);
        customerId = res?.data?.id || res?.data?.customer?.id || res?.data?.data?.id || null;
      }

      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { type: 'success', message: isArabic ? 'تم التحويل إلى عميل' : 'Converted to customer' }
      }));

      setShowHeaderMenu(false);

      try {
        const baseUrl = isRealEstateTenant ? '/contract-collections/customers' : '/customers';
        const url = `${baseUrl}${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''}`;
        navigate(url);
      } catch (e) {}
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Convert failed';
      alert(msg);
    } finally {
      setConvertCustomerLoading(false);
    }
  };

  const handleRealEstateCustomerConverted = async (payload) => {
    const customerId = payload?.customer?.id || payload?.data?.customer?.id || payload?.id || payload?.data?.id || null;

    window.dispatchEvent(new CustomEvent('app:toast', {
      detail: {
        type: 'success',
        message: isArabic ? 'تم تحويل الليد إلى عميل وربطه بالوحدة' : 'Lead converted and linked to unit',
      },
    }));

    try {
      await api.put(`/leads/${lead.id}`, { status: 'converted', stage: 'converted' });
      onUpdateLead?.({ ...(effectiveLead || lead), status: 'converted', stage: 'converted' });
    } catch (e) {
      console.warn('Failed to update lead status', e);
    }

    setShowConvertCustomerModal(false);
    try {
      const url = `/contract-collections/customers${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''}`;
      navigate(url);
    } catch (e) {}
  };

  // Helper to transform API action to UI format
  const transformAction = (action) => {
    if (!action) return null;
    let details = action.details || {};
    if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch(e) { details = {}; }
    }
    const creator = action.creator || (typeof action.user === 'object' ? action.user : null);
    const creatorRole = creator?.role || action.role || '';
    const normalizedType = String(action.action_type || action.type || '').toLowerCase();
    const isMeetingAction =
      normalizedType === 'meeting' ||
      String(action.next_action_type || details.next_action_type || '').toLowerCase() === 'meeting';
    const actionNoteText =
      normalizedType === 'note'
        ? (action.description || details.description || details.notes || action.notes || '')
        : isMeetingAction
          ? (details.notes || action.notes || details.description || action.description || '')
          : (details.reservationNotes || details.reservation_notes || details.notes || action.notes || '');

    return {
      ...action,
      id: action.id,
      details: details,
      type: action.action_type || action.type || details.actionType || details.action_type || details.channel || details.selectedQuickOption || 'call',
      title: action.title || details.title || getTypeLabel(action.action_type || action.type),
      description: action.description || details.description || '',
      date: details.date || action.date || '',
      time: details.time || action.time || '',
      user: action.creator?.name || action.user?.name || action.user || 'Unknown', // Handle object or string
      userRole: creatorRole,
      status: details.status || action.status || 'pending',
      priority: details.priority || action.priority || 'medium',
      notes: actionNoteText,
      comments: details.comments || [],
    };
  };

  const getActionExtraFields = (action) => {
    const details = action.details || {};
    const merged = { ...details, ...action };
    const fields = [];
    const addField = (key, labelAr, labelEn, formatter) => {
      const raw = merged[key];
      if (raw === undefined || raw === null || raw === '') return;
      const val = formatter ? formatter(raw) : raw;
      fields.push({
        key,
        label: isArabic ? labelAr : labelEn,
        value: val
      });
    };

    const currentType = String(merged.action_type || merged.type || '').toLowerCase();
    const nextType = merged.next_action_type || merged.nextAction || merged.next_action || '';
    const lowerNext = String(nextType || '').toLowerCase();

    if (currentType === 'closing_deals' || lowerNext === 'closing_deals') {
      addField('closingRevenue', 'الإيرادات', 'Revenue', v => Number(v).toLocaleString());
    }

    if (currentType === 'proposal' || lowerNext === 'proposal') {
      addField('proposalAmount', 'قيمة العرض', 'Proposal Amount', v => Number(v).toLocaleString());
      addField('proposalDiscount', 'الخصم %', 'Discount %');
      addField('proposalValidityDays', 'مدة الصلاحية (أيام)', 'Validity Days');
    }

    if (currentType === 'reservation' || lowerNext === 'reservation') {
      addField('reservationType', 'نوع الحجز', 'Reservation Type');
      addField('reservationAmount', 'قيمة الحجز', 'Reservation Amount', v => Number(v).toLocaleString());
    }

    if (currentType === 'rent' || lowerNext === 'rent') {
      addField('rentAmount', 'قيمة الإيجار', 'Rent Amount', v => Number(v).toLocaleString());
      addField('rentStart', 'بداية الإيجار', 'Rent Start');
      addField('rentEnd', 'نهاية الإيجار', 'Rent End');
    }

    if (currentType === 'cancel' || lowerNext === 'cancel') {
      addField('cancelReason', 'سبب الإلغاء', 'Cancel Reason');
    }

    if (currentType === 'not_interested' || lowerNext === 'not_interested') {
      addField('notInterestReason', 'سبب عدم الاهتمام', 'Not Interest Reason');
    }

    if (currentType === 'meeting' || lowerNext === 'meeting' || currentType === 'google_meet') {
      addField('meetingType', 'نوع الاجتماع', 'Meeting Type');
      addField('meetingLocation', 'مكان الاجتماع', 'Meeting Location');
      
      // Update: use the detailed meeting_status if available, fallback to doneMeeting
      if (merged.meeting_status) {
        addField('meeting_status', 'حالة الاجتماع', 'Meeting Status', s => {
          if (isArabic) {
            if (s === 'scheduled') return 'مجدول';
            if (s === 'done') return 'تم بنجاح';
            if (s === 'no_show') return 'لم يحضر (ميسد)';
            if (s === 'cancelled') return 'ملغي';
          }
          return String(s).charAt(0).toUpperCase() + String(s).slice(1).replace('_', ' ');
        });
      } else {
        addField('doneMeeting', 'حالة الاجتماع', 'Meeting Status', v => v ? (isArabic ? 'تم الاجتماع' : 'Meeting Done') : (isArabic ? 'لم يتم' : 'Not Done'));
      }
    }

    if (merged.answerStatus) {
      addField('answerStatus', 'حالة الرد', 'Answer Status', v => v === 'answer' ? (isArabic ? 'إجابة' : 'Answered') : (isArabic ? 'لا يوجد رد' : 'No Answer'));
    }

    return fields;
  };

  useEffect(() => {
    const source = fetchedLead || lead;
    const id = source?.id;
    if (!id) {
      setLeadActions([]);
      return;
    }

    let cancelled = false;

    const fetchActions = async () => {
      try {
        const res = await api.get('/api/lead-actions', { params: { lead_id: id } });
        const data = Array.isArray(res.data) ? res.data : (res.data.actions || []);
        if (!cancelled) {
          setLeadActions(data.map(transformAction));
        }
      } catch (e) {
        console.error('Failed to fetch actions for lead details modal', e);
        if (!cancelled) {
          setLeadActions([]);
        }
      }
    };

    fetchActions();

    return () => {
      cancelled = true;
    };
  }, [lead?.id, fetchedLead?.id]);

  // Sample data for demonstration
  const leadData = {
    name: effectiveLead?.fullName || effectiveLead?.leadName || effectiveLead?.name || '-',
    phone: effectiveLead?.mobile || effectiveLead?.phone || '-',
    email: effectiveLead?.email || '-',
    company: effectiveLead?.company || '-',
    location: effectiveLead?.location || (isArabic ? 'غير محدد' : 'Not specified'),
    source: effectiveLead?.source || '-',
    notes: effectiveLead?.notes || effectiveLead?.note || '',
    createdDate: effectiveLead?.created_at
      ? formatCrmDate(effectiveLead.created_at, { crmSettings })
      : (effectiveLead?.createdDate || '-'),
    status: effectiveLead?.status || 'qualified',
    priority: effectiveLead?.priority || 'high',
    stage: effectiveLead?.stage || (isArabic ? 'جديد' : 'New'),
    createdBy: effectiveLead?.creator?.name || effectiveLead?.createdBy || (isArabic ? 'غير محدد' : 'Not specified'),
    salesPerson: (() => {
      const resolveUserNameById = (id) => {
        if (!id) return '';
        const idStr = String(id);

        const fromUsers = Array.isArray(usersList)
          ? usersList.find(u => String(u?.id) === idStr || String(u?.user_id) === idStr)
          : null;
        if (fromUsers?.name) return fromUsers.name;

        const fromAssignees = Array.isArray(assignees)
          ? assignees.find(u => String(u?.id) === idStr || String(u?.user_id) === idStr)
          : null;
        if (fromAssignees?.name) return fromAssignees.name;

        return '';
      };

      // Prefer explicit name fields if present
      const directName =
        assignedToName ||
        effectiveLead?.sales_person_name ||
        effectiveLead?.salesPersonName ||
        effectiveLead?.employee_name ||
        effectiveLead?.assignedAgent?.name;
      if (directName) return directName;

      // sales_person may be a name string or a user object
      const spRaw = effectiveLead?.sales_person;
      if (spRaw && typeof spRaw === 'object' && spRaw?.name) return spRaw.name;
      if (typeof spRaw === 'string' && isNaN(Number(spRaw))) return spRaw;

      // Otherwise treat values as IDs and resolve via usersList/assignees
      const idCandidate =
        assignedToId ??
        (typeof spRaw === 'number' || (typeof spRaw === 'string' && !isNaN(Number(spRaw))) ? spRaw : null) ??
        (typeof effectiveLead?.assigned_to === 'number' || (typeof effectiveLead?.assigned_to === 'string' && !isNaN(Number(effectiveLead?.assigned_to))) ? effectiveLead?.assigned_to : null) ??
        (typeof effectiveLead?.assignedTo === 'number' || (typeof effectiveLead?.assignedTo === 'string' && !isNaN(Number(effectiveLead?.assignedTo))) ? effectiveLead?.assignedTo : null) ??
        (typeof effectiveLead?.salesPerson === 'number' || (typeof effectiveLead?.salesPerson === 'string' && !isNaN(Number(effectiveLead?.salesPerson))) ? effectiveLead?.salesPerson : null);

      const resolved = resolveUserNameById(idCandidate);
      if (resolved) return resolved;

      return isArabic ? 'غير محدد' : 'Unassigned';
    })()
  };

  const leadProjectValue =
    effectiveLead?.project?.name ||
    effectiveLead?.project_name ||
    effectiveLead?.projectName ||
    effectiveLead?.project ||
    effectiveLead?.meta_data?.project_name ||
    effectiveLead?.metaData?.project_name ||
    '-';

  const leadItemValue =
    effectiveLead?.item?.name ||
    effectiveLead?.item_name ||
    effectiveLead?.itemName ||
    effectiveLead?.item ||
    effectiveLead?.meta_data?.item_name ||
    effectiveLead?.metaData?.item_name ||
    '-';

  const resolveCountryLabel = useCallback((raw) => {
    const value = String(raw || '').trim();
    if (!value) return isArabic ? 'غير محدد' : 'Not specified';
    const match = countriesList.find(c =>
      String(c?.name_en || '').trim() === value ||
      String(c?.name_ar || '').trim() === value ||
      String(c?.code || '').trim() === value
    );
    if (!match) return value;
    return isArabic ? (match.name_ar || match.name_en) : match.name_en;
  }, [countriesList, isArabic]);

  const leadCountryRaw =
    effectiveLead?.country?.name ||
    effectiveLead?.country_name ||
    effectiveLead?.countryName ||
    effectiveLead?.country ||
    effectiveLead?.meta_data?.country ||
    effectiveLead?.metaData?.country ||
    '';

  const leadCountryValue = resolveCountryLabel(leadCountryRaw);

  const buildLeadInformationRows = (entries) => [
    {
      key: isRealEstateTenant ? 'project' : 'item',
      label: isRealEstateTenant
        ? (isArabic ? 'المشروع:' : 'Project:')
        : (isArabic ? 'الصنف:' : 'Item:'),
      value: isRealEstateTenant ? leadProjectValue : leadItemValue,
    },
    {
      key: 'phone',
      label: isArabic ? 'Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ:' : 'Phone:',
      value: entries.length > 0
        ? entries.map((entry) => entry.display).join('\n')
        : '-',
      multiline: entries.length > 1,
    },
    {
      key: 'source',
      label: isArabic ? 'المصدر:' : 'Source:',
      value: leadData.source || '-',
    },
    {
      key: 'sales-person',
      label: isArabic ? 'موظف المبيعات:' : 'Sales Person:',
      value: leadData.salesPerson || (isArabic ? 'غير محدد' : 'Unassigned'),
    },
    ...(canShowCreatorPermission
      ? [{
          key: 'created-by',
          label: isArabic ? 'تم الإنشاء بواسطة:' : 'Created By:',
          value: leadData.createdBy || (isArabic ? 'غير محدد' : 'Not specified'),
        }]
      : []),
    {
      key: 'creation-date',
      label: isArabic ? 'تاريخ الإنشاء:' : 'Creation Date:',
      value: leadData.createdDate || '-',
    },
    {
      key: 'country',
      label: isArabic ? 'الدولة:' : 'Country:',
      value: leadCountryValue,
    },
    {
      key: 'notes',
      label: isArabic ? 'ملاحظات:' : 'Notes:',
      value: leadData.notes && String(leadData.notes).trim() !== ''
        ? leadData.notes
        : '-',
      multiline: true,
    },
  ];

  const getLeadDefaultCountryCode = (leadItem) =>
    leadItem?.phone_country ||
    leadItem?.phoneCountry ||
    leadItem?.meta_data?.phone_country ||
    leadItem?.metaData?.phone_country ||
    leadItem?.meta_data?.phoneCountry ||
    leadItem?.metaData?.phoneCountry ||
    '+20';

  const getLeadPhoneEntries = (leadItem) => {
    const defaultCountryCode = getLeadDefaultCountryCode(leadItem);
    const notesPhoneMatch = String(leadItem?.notes || leadItem?.note || '')
      .match(/(?:^|\n)\s*Other phones?\s*:\s*([^\n]+)/i);
    const notesOtherPhones = notesPhoneMatch?.[1] || '';
    const values = [
      leadItem?.phone,
      leadItem?.mobile,
      leadItem?.other_mobile,
      leadItem?.otherMobile,
      leadItem?.other_phone,
      leadItem?.otherPhone,
      leadItem?.meta_data?.other_mobile,
      leadItem?.metaData?.other_mobile,
      leadItem?.meta_data?.otherMobile,
      leadItem?.metaData?.otherMobile,
      leadItem?.meta_data?.other_phone,
      leadItem?.metaData?.other_phone,
      leadItem?.meta_data?.otherPhone,
      leadItem?.metaData?.otherPhone,
      leadItem?.custom_fields?.other_mobile,
      leadItem?.custom_fields?.otherMobile,
      leadItem?.custom_fields?.other_phone,
      leadItem?.custom_fields?.otherPhone,
      leadItem?.custom_fields?.phone2,
      leadItem?.custom_fields?.phone_2,
      leadItem?.custom_fields?.mobile2,
      leadItem?.custom_fields?.mobile_2,
      notesOtherPhones,
    ];

    const seen = new Set();
    const entries = [];

    values.forEach((value) => {
      const raw = String(value || '').trim();
      if (!raw) return;

      getPhoneLines(raw, {
        showFull: crmSettings?.showMobileNumber !== false,
        defaultCountryCode,
      }).forEach((line) => {
        const digitsKey = String(line?.digits || '').trim();
        const displayKey = String(line?.display || '').trim();
        const key = digitsKey || displayKey;
        if (!key || seen.has(key)) return;
        seen.add(key);
        entries.push({ display: displayKey, digits: digitsKey });
      });
    });

    return entries;
  };

  const phoneEntries = getLeadPhoneEntries(effectiveLead);
  const leadInformationRows = buildLeadInformationRows(phoneEntries);

  const copyPhoneToClipboard = async (phone) => {
    const value = String(phone || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast('success', isArabic ? 'تم نسخ الرقم' : 'Phone copied');
    } catch {
      showToast('error', isArabic ? 'تعذر نسخ الرقم' : 'Could not copy phone');
    }
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (!lead?.id) {
        setCheckInHistory([]);
        return;
      }
      try {
        const res = await api.get(`/api/visits`, { params: { lead_id: lead.id, limit: 500 } });
        const visits = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const sorted = visits
          .filter(v => v.type === 'lead')
          .sort((a, b) => new Date(b.checkInDate || b.check_in_at) - new Date(a.checkInDate || a.check_in_at));
        setCheckInHistory(sorted);
      } catch (e) {
        console.error('Error loading check-in history', e);
        setCheckInHistory([]);
      }
    };
    fetchHistory();
  }, [lead?.id]);

  const filteredCheckInHistory = checkInHistory.filter(item => {
    if (!historyDateFilter) return true;
    const itemDate = new Date(item.checkInDate).toISOString().split('T')[0];
    return itemDate === historyDateFilter;
  }).sort((a, b) => new Date(b.checkInDate) - new Date(a.checkInDate));

  // Mock Teams Data
  const TEAMS_DATA = {
    'Sales Team A': ['Ahmed Ali', 'Sara Noor'],
    'Sales Team B': ['Ibrahim'],
    'Marketing': ['Dina', 'Elias']
  };

  const headerMenuRef = useRef(null);
  const headerMenuBtnRef = useRef(null);
  const assignMenuRef = useRef(null);
  const assignMenuBtnRef = useRef(null);
  const { stages } = useStages();

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Header Menu
      if (showHeaderMenu) {
        const menuEl = headerMenuRef.current;
        const btnEl = headerMenuBtnRef.current;
        if (menuEl && !menuEl.contains(e.target) && btnEl && !btnEl.contains(e.target)) {
          setShowHeaderMenu(false);
        }
      }
      // Assign Menu
      if (showAssignMenu) {
        const menuEl = assignMenuRef.current;
        const btnEl = assignMenuBtnRef.current;
        if (menuEl && !menuEl.contains(e.target) && btnEl && !btnEl.contains(e.target)) {
          setShowAssignMenu(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showHeaderMenu, showAssignMenu]);
  const [paymentPlan, setPaymentPlan] = useState(lead?.paymentPlan || null);
  const [cardsLoading, setCardsLoading] = useState(false);

  useEffect(() => {
    setPaymentPlan(lead?.paymentPlan || null);
  }, [lead]);



  useEffect(() => {
    // When lead changes or opens, start loading effect
    if (isOpen) {
      setCardsLoading(true);
      const timer = setTimeout(() => {
        setCardsLoading(false);
      }, 1000); // 1 second delay for realistic effect
      return () => clearTimeout(timer);
    }
  }, [isOpen, lead?.id]);



  const handleAddAction = async (newAction) => {
    console.log('إضافة إجراء جديد:', newAction);

    const nextActionType = newAction?.nextAction || newAction?.next_action_type || '';
    const explicitStageName =
      newAction?.stage_name ||
      newAction?.stage_label ||
      newAction?.stageAtCreation ||
      newAction?.stage_at_creation_name ||
      '';

    // Save reservation data if applicable
    if (nextActionType === 'reservation') {
      // ... existing reservation logic (kept as is) ...
      console.log('Processing Reservation. Raw Action:', newAction);

      // Intelligent Type Detection to resolve potential mismatches
      let effectiveType = newAction.reservationType;
      // If item is present (and it's not a project), force general
      if (newAction.reservationItem && newAction.reservationItem !== '') {
        effectiveType = 'general';
      }
      // If project is present (and it's not general item), force project
      if (newAction.reservationProject && newAction.reservationProject !== '') {
        effectiveType = 'project';
      }

      console.log('Effective Reservation Type:', effectiveType);

        if (effectiveType === 'project') {
          const realEstateRequest = {
            id: Date.now(),
            customer: leadData.name,
            project: newAction.reservationProject,
            unit: newAction.reservationUnit,
            amount: newAction.reservationAmount,
            status: 'Pending',
            type: 'Booking',
            date: new Date().toISOString().split('T')[0],
            notes: newAction.reservationNotes,
            phone: leadData.phone,
            ...(lead?.id ? { meta_data: { lead_id: lead.id } } : {})
          };
        console.log('Saving to Real Estate:', realEstateRequest);
        await saveRealEstateRequest(realEstateRequest);
        const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم حفظ طلب المشروع' : 'Project Request Saved' } });
        window.dispatchEvent(evt);
      } else if (effectiveType === 'general') {
        let requestType = 'Purchase Order';
        if (newAction.reservationCategory === 'service') requestType = 'Inquiry';
        if (newAction.reservationCategory === 'subscription') requestType = 'Subscription';

        const inventoryRequest = {
          customer: leadData.name,
          item: newAction.reservationItem || 'Unspecified Item',
          amount: Number(newAction.reservationAmount) || 0,
          type: requestType,
          status: 'Pending',
          date: new Date().toISOString().split('T')[0],
          notes: newAction.reservationNotes || '',
          phone: leadData.phone
        };

        try {
          console.log('Saving inventory request:', inventoryRequest);
          await saveInventoryRequest(inventoryRequest);
          // Dispatch event to ensure RequestsPage updates
          window.dispatchEvent(new Event('inventory-requests-updated'));

          const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم حفظ طلب المخزون' : 'Inventory Request Saved' } });
          window.dispatchEvent(evt);
        } catch (error) {
          console.error('Error saving inventory request:', error);
          const evt = new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'حدث خطأ أثناء الحفظ' : 'Error saving request' } });
          window.dispatchEvent(evt);
        }
      }
    }

    // Update Lead Stage if nextAction corresponds to a stage
    let newStage = null;
    if (nextActionType) {
      // Helper to normalize string
      const norm = (str) => String(str || '').toLowerCase().trim();

      let matchedStageObj = null;

      // 1. Try to match by type (most robust, works with renamed stages)
      const typeMatches = (Array.isArray(stages) ? stages : []).filter(s => s.type === nextActionType);

      if (typeMatches.length > 0) {
        if (nextActionType === 'follow_up') {
          // Priority 1: Exact "Follow Up" or "Pending" match by name
          const priorityMatch = typeMatches.find(s => {
            const n = norm(s.name);
            const nAr = norm(s.nameAr);
            return n === 'follow up' || n === 'follow-up' || n === 'pending' ||
              nAr === 'متابعة' || nAr === 'قيد الانتظار';
          });

          if (priorityMatch) {
            matchedStageObj = priorityMatch;
          } else {
            // Priority 2: Anything that is NOT "No Answer"
            const notNoAnswer = typeMatches.find(s => {
              const n = norm(s.name);
              const nAr = norm(s.nameAr);
              return !n.includes('no answer') && !nAr.includes('لا رد') && !n.includes('phone off');
            });
            matchedStageObj = notNoAnswer;
          }
        } else {
          matchedStageObj = typeMatches[0];
        }
      }

      // 2. If no type match, fall back to Name matching
      if (!matchedStageObj) {
        const normalizedNextAction = String(nextActionType).replace(/_/g, ' ').toLowerCase();

        // Expanded map to cover more cases and exact default stage names
        const actionToStageMap = {
          'reservation': ['reservation', 'booking', 'won', 'closed', 'حجز', 'مباع'],
          'closing_deals': ['closing deal', 'closing', 'deal', 'won', 'closed', 'إغلاق', 'صفقة'],
          'rent': ['rent', 'leased', 'won', 'إيجار', 'مؤجر'],
          'cancel': ['cancelation', 'cancellation', 'cancelled', 'lost', 'archive', 'cold calls', 'إلغاء', 'خسارة', 'العملاء المحتملين'],
          'meeting': ['meeting', 'negotiation', 'pending', 'اجتماع', 'تفاوض'],
          'proposal': ['proposal', 'quote', 'negotiation', 'pending', 'عرض سعر', 'عرض'],
          'follow_up': ['follow up', 'follow-up', 'pending', 'متابعة', 'قيد الانتظار']
        };

        let candidates = actionToStageMap[nextActionType] || [];
        if (!candidates.includes(normalizedNextAction)) {
          candidates = [normalizedNextAction, ...candidates];
        }

        for (const candidate of candidates) {
          const match = (Array.isArray(stages) ? stages : []).find(s => {
            const sName = norm(typeof s === 'string' ? s : s.name);
            const sNameAr = norm(s.nameAr);

            // 1. Exact match
            if (sName === candidate || sNameAr === candidate) return true;

            // 2. Partial match (if candidate is significant length)
            if (candidate.length > 3 && (sName.includes(candidate) || (sNameAr && sNameAr.includes(candidate)))) return true;

            return false;
          });

          if (match) {
            matchedStageObj = typeof match === 'string' ? { name: match } : match;
            break;
          }
        }
      }

      if (explicitStageName) {
        newStage = explicitStageName;
      } else if (matchedStageObj) {
        newStage = matchedStageObj.name;
      }
    }

    const stageToUse = newStage || (fetchedLead?.stage || lead?.stage);

    const actionEntry = {
      ...newAction,
      id: Date.now(),
      date: newAction.date || new Date().toISOString().split('T')[0],
      time: newAction.time || new Date().toTimeString().slice(0, 5),
      created_at: new Date().toISOString(),
      stageAtCreation: stageToUse,
      description: newAction.description || newAction.notes || '',
      assignee: newAction.assignedTo || newAction.assignee || lead?.assignedTo || lead?.salesPerson || 'غير محدد'
    };

    try {
      const leadUpdatePayload = {};
      let shouldUpdateLead = false;

      if (newStage && newStage !== (fetchedLead?.stage || lead?.stage)) {
        leadUpdatePayload.stage = newStage;
        shouldUpdateLead = true;
      }

      const actionType = String(newAction.type || newAction.action_type || '').toLowerCase();
      const newNote = newAction.description || newAction.notes;
      if (actionType === 'note' && newNote && (!fetchedLead?.notes || newNote !== fetchedLead.notes)) {
        leadUpdatePayload.notes = newNote;
        shouldUpdateLead = true;
      }

      if (shouldUpdateLead) {
        await api.put(`/api/leads/${lead.id}`, leadUpdatePayload);
      }

      try {
        const actionsRes = await api.get('/api/lead-actions', { params: { lead_id: lead.id } });
        const serverActions = Array.isArray(actionsRes.data)
          ? actionsRes.data
          : (actionsRes.data.actions || []);
        setLeadActions(serverActions.map(transformAction));
      } catch (actionsErr) {
        console.error('Failed to fetch updated actions after saving action', actionsErr);
      }

      try {
        const freshLeadRes = await api.get(`/api/leads/${lead.id}`);
        const freshLead = freshLeadRes.data.lead || freshLeadRes.data;

        setFetchedLead(freshLead);

        if (onUpdateLead) {
          onUpdateLead(freshLead);
        }
      } catch (fetchErr) {
        console.error('Failed to fetch updated lead after saving action', fetchErr);
        setFetchedLead(prev => ({ ...prev, ...leadUpdatePayload }));
        if (onUpdateLead) {
          onUpdateLead({ ...fetchedLead, ...leadUpdatePayload });
        }
      }

      const storedLeads = JSON.parse(localStorage.getItem('leadsData') || '[]');
      const leadIndex = storedLeads.findIndex(l => l.id === lead.id);
      if (leadIndex >= 0) {
        storedLeads[leadIndex] = { ...storedLeads[leadIndex], ...leadUpdatePayload };
        localStorage.setItem('leadsData', JSON.stringify(storedLeads));
        window.dispatchEvent(new CustomEvent('leadsDataUpdated'));
      }

      const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم حفظ الإجراء بنجاح' : 'Action saved successfully' } });
      window.dispatchEvent(evt);

    } catch (err) {
      console.error('Failed to save action to API:', err);
      const evt = new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'فشل حفظ الإجراء' : 'Failed to save action' } });
      window.dispatchEvent(evt);
    }

    setShowAddActionModal(false);
  };

  const handleReAssign = async (assignData) => {
    try {
      const { stage, history_option } = buildLeadTransferPayload(assignData);

      await api.post(`/api/leads/${lead.id}/transfer`, {
        assigned_to: assignData.userId,
        stage,
        history_option
      });

      try {
        const freshLeadRes = await api.get(`/api/leads/${lead.id}`);
        const freshLead = freshLeadRes.data.lead || freshLeadRes.data;

        setFetchedLead(freshLead);

        if (onAssign) {
          onAssign(freshLead.sales_person || assignData.userName);
        }
      } catch (fetchErr) {
        console.error('Failed to fetch updated lead after re-assign', fetchErr);
        // Fallback
        setFetchedLead(prev => ({
          ...prev,
          assignedTo: assignData.userName,
          salesPerson: assignData.userName,
          assignedAgent: { id: assignData.userId, name: assignData.userName }
        }));
        if (onAssign) {
          onAssign(assignData.userName);
        }
      }

      const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم إعادة التعيين بنجاح' : 'Lead re-assigned successfully' } });
      window.dispatchEvent(evt);
    } catch (err) {
      console.error('Failed to re-assign lead:', err);
      const evt = new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'فشل إعادة التعيين' : 'Failed to re-assign lead' } });
      window.dispatchEvent(evt);
    }
  };

  const getStageStyle = (stageName) => {
    const currentStageValue = String(stageName || '').toLowerCase();
    const matchedStage = (Array.isArray(stages) ? stages : []).find((s) => {
      const name = typeof s === 'string' ? s : s?.name;
      const nameAr = typeof s === 'string' ? '' : s?.nameAr;
      return String(name || '').toLowerCase() === currentStageValue || String(nameAr || '').toLowerCase() === currentStageValue;
    });

    const style = matchedStage ? (
      (typeof matchedStage !== 'string' && typeof matchedStage.color === 'string')
        ? (matchedStage.color.trim().startsWith('#')
          ? { backgroundColor: matchedStage.color }
          : { background: `var(--stage-${matchedStage.color}-swatch, ${matchedStage.color})` }
        )
        : {}
    ) : {};

    const className = `px-3 py-1 text-white text-sm rounded-full font-medium${matchedStage ? '' : ' bg-blue-500'}`;

    return { style, className };
  };

  const { style: stageColorStyle, className: stageBadgeClass } = getStageStyle(leadData.stage);
  const activities = [
    {
      id: 1,
      text: 'الشهر هكذا لم نتمكن الحصان إبن علي',
      date: '15-01-2024',
      status: 'completed',
      icon: 'check'
    },
    {
      id: 2,
      text: 'الشهر هكذا لم نتمكن الحصان إبن علي',
      date: '15-01-2024',
      status: 'completed',
      icon: 'check'
    },
    {
      id: 3,
      text: 'الشهر هكذا لم نتمكن الحصان إبن علي',
      date: '15-01-2024',
      status: 'scheduled',
      icon: 'clock'
    }
  ];

  // تمت إزالة بيانات العينة؛ ستُدار الإجراءات من خلال الحالة actions المُحدّثة عبر AddActionModal

  const handleActionCommentSubmit = async (actionId, text) => {
    if (!text || !text.trim()) return;

    setCommentSubmitting(prev => ({ ...prev, [actionId]: true }));

    try {
      const actionIndex = leadActions.findIndex(a => a.id === actionId);
      if (actionIndex === -1) return;

      const action = leadActions[actionIndex];
      const currentComments = action.comments || [];

      const newComment = {
        id: Date.now().toString(),
        text: text.trim(),
        user: user?.name || 'Unknown',
        userId: user?.id,
        role: user?.role || 'Unknown',
        createdAt: new Date().toISOString()
      };

      const updatedComments = [...currentComments, newComment];

      // Optimistic update
      const updatedAction = { ...action, comments: updatedComments };
      const updatedActions = [...leadActions];
      updatedActions[actionIndex] = updatedAction;
      setLeadActions(updatedActions);

      // API Call
      await api.put(`/api/lead-actions/${actionId}`, {
        details: {
          comments: updatedComments
        }
      });

      // Clear input
      setCommentInputs(prev => ({ ...prev, [actionId]: '' }));

      const toast = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم إضافة التعليق' : 'Comment added' } });
      window.dispatchEvent(toast);

    } catch (error) {
      console.error('Failed to add comment', error);
      const toast = new CustomEvent('app:toast', { detail: { type: 'error', message: isArabic ? 'فشل إضافة التعليق' : 'Failed to add comment' } });
      window.dispatchEvent(toast);
    } finally {
      setCommentSubmitting(prev => ({ ...prev, [actionId]: false }));
    }
  };

  const filteredActions = leadActions
    .filter(action => {
      const matchesSearch = action.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        action.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || action.status === filterStatus;
      const matchesType = filterType === 'all' || 
                        (filterType === 'meeting' 
                          ? (String(action.type).toLowerCase() === 'meeting' || String(action.next_action_type).toLowerCase() === 'meeting') 
                          : filterType === 'email' 
                            ? ['email', 'whatsapp', 'sms'].includes(String(action.type).toLowerCase())
                            : String(action.type).toLowerCase() === filterType);
      return matchesSearch && matchesStatus && matchesType;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (createdA !== createdB) {
          return createdB - createdA;
        }
        const dateA = new Date(`${a.date}T${(a.time || '00:00')}`).getTime();
        const dateB = new Date(`${b.date}T${(b.time || '00:00')}`).getTime();
        return dateB - dateA;
      }
      if (sortBy === 'priority') {
        const priorityOrder = { hot: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status);
      }
      const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return createdB - createdA;
    });

  // Action statistics
  const actionStats = useMemo(() => {
    const total = leadActions.length;
    const completed = leadActions.filter(a => a.status === 'completed').length;
    
    // Logic for Delay:
    // 1. If there's a scheduled action in the future, it's NOT a delay.
    // 2. If there's an action whose scheduled date/time has passed, it's a delay.
    // 3. If there are NO future actions and the lead is active, it might be considered a delay (depending on business rules).
    
    const now = new Date();
    const delayedActions = leadActions.filter(a => {
      if (a.status === 'completed') return false;
      if (!a.date) return false;
      
      const scheduledDate = new Date(`${a.date}T${a.time || '00:00'}`);
      return scheduledDate < now;
    });

    return {
      total,
      completed,
      delay: delayedActions.length,
      scheduled: leadActions.filter(a => a.status === 'scheduled').length
    };
  }, [leadActions]);

  if (!isOpen) return null;

  // Helper functions
  const getActionStage = (action) => {
    const details = action.details || {};

    // 1) أولاً: محاولة جلب اسم المرحلة الفعلي وقت إنشاء الإجراء (الأكثر دقة)
    const stageIdRaw =
      action.stage_id_at_creation ||
      action.stage_id ||
      details.stage_id_at_creation ||
      details.stage_id;

    if (stageIdRaw && Array.isArray(stages)) {
      const stageId = String(stageIdRaw);
      const match = stages.find(s => String(s.id) === stageId);
      if (match && match.name) {
        return match.name;
      }
    }

    // بدائل لاسم المرحلة مخزنة مسبقاً
    if (details.imported_stage) return details.imported_stage;
    if (details.stage_at_creation_name) return details.stage_at_creation_name;
    if (details.stageAtCreationName) return details.stageAtCreationName;
    if (action.stageAtCreation) return action.stageAtCreation;
    if (action.stage) return action.stage;
    if (details.stage) return details.stage;

    // 2) ثانياً: إذا لم تتوفر مرحلة محددة، نستخدم نوع الإجراء المختار (next_action_type أو action_type) كبديل للعرض
    const rawType =
      action.next_action_type ||
      details.next_action_type ||
      details.nextAction ||
      action.action_type ||
      action.type;

    if (rawType) {
      const key = String(rawType).toLowerCase();
      switch (key) {
        case 'reservation':
          return isArabic ? 'حجز' : 'Reservation';
        case 'closing_deals':
          return isArabic ? 'إغلاق الصفقات' : 'Closing Deals';
        case 'rent':
          return isArabic ? 'إيجار' : 'Rent';
        case 'cancel':
          return isArabic ? 'إلغاء' : 'Cancel';
        case 'meeting':
          return isArabic ? 'اجتماع' : 'Meeting';
        case 'follow_up':
          return isArabic ? 'متابعة' : 'Follow Up';
        case 'call':
          return isArabic ? 'مكالمة' : 'Call';
        default:
          return key.replace(/_/g, ' ');
      }
    }

    return leadData.stage;
  };

  const getActionIcon = (type) => {
    switch (type) {
      case 'call': return <FaPhone className="text-blue-400" />;
      case 'email': return <FaEnvelope className="text-green-400" />;
      case 'meeting': return <FaCalendarAlt className="text-purple-400" />;
      case 'note': return <FaEdit className="text-yellow-400" />;
      case 'task': return <FaList className="text-orange-400" />;
      default: return <FaCog className="text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'pending': return 'bg-orange-500';
      case 'scheduled': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'hot': return 'text-red-400 border-red-400';
      case 'high': return 'text-green-400 border-green-400';
      case 'medium': return 'text-yellow-400 border-yellow-400';
      case 'low': return 'text-red-400 border-red-400';
      default: return 'text-gray-400 border-gray-400';
    }
  };

  const resolveActionType = (action) => {
    const details = action?.details || {};
    return String(
      action?.type ||
      action?.action_type ||
      details?.actionType ||
      details?.action_type ||
      details?.channel ||
      details?.selectedQuickOption ||
      action?.next_action_type ||
      details?.next_action_type ||
      details?.nextAction ||
      details?.type ||
      ''
    ).toLowerCase().trim();
  };

  const normalizeActionKey = (value) =>
    String(value || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

  const isFinalAction = (action) => {
    const details = action?.details || {};
    const values = [
      action?.type,
      action?.action_type,
      action?.next_action_type,
      action?.stage,
      action?.stageAtCreation,
      details?.actionType,
      details?.action_type,
      details?.next_action_type,
      details?.nextAction,
      details?.stage,
      details?.stage_at_creation_name,
      details?.stageAtCreationName,
      getActionStage(action),
    ].map(normalizeActionKey);

    return values.some((value) => [
      'cancel',
      'cancellation',
      'cancelled',
      'closing_deals',
      'closing_deal',
      'done_deal',
      'done_deals',
      'won',
      'lost',
    ].includes(value));
  };

  const getScheduledNextActionDateTime = (action) => {
    const details = action?.details || {};
    const terminalValues = [
      action?.next_action_type,
      action?.nextAction,
      action?.action_type,
      action?.type,
      details?.next_action_type,
      details?.nextAction,
      details?.action_type,
      details?.actionType,
      action?.stage,
      details?.stage,
    ]
      .map((value) => String(value || '').toLowerCase().trim().replace(/[\s-]+/g, '_'));

    if (terminalValues.some((value) => ['cancel', 'not_interested', 'closing_deals', 'closing_deal', 'won', 'lost'].includes(value))) {
      return '';
    }

    const dateRaw =
      details?.next_action_date ||
      details?.nextActionDate ||
      details?.date ||
      action?.next_action_date ||
      action?.nextActionDate ||
      action?.date ||
      '';
    const timeRaw =
      details?.next_action_time ||
      details?.nextActionTime ||
      details?.time ||
      action?.next_action_time ||
      action?.nextActionTime ||
      action?.time ||
      '';
    const datePart = String(dateRaw || '').includes('T')
      ? String(dateRaw).split('T')[0]
      : String(dateRaw || '').trim();
    const timePart = String(timeRaw || '').trim();
    if (!datePart) {
      return '';
    }

    return formatCrmCalendarDateTime(datePart, timePart, { crmSettings }) || `${datePart}${timePart ? ` ${timePart.slice(0, 5)}` : ''}`;
  };

  const formatActionDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const formatted = formatCrmDateTime(value, {
      crmSettings,
      language: isArabic ? 'ar' : 'en',
    });

    return formatted || '-';
  };

  const getTypeColor = (type) => {
    switch (String(type).toLowerCase()) {
      case 'call': return 'text-blue-400 border-blue-400';
      case 'email': return 'text-yellow-400 border-yellow-400';
      case 'meeting': return 'text-purple-400 border-purple-400';
      case 'whatsapp': return 'text-green-400 border-green-400';
      case 'sms': return 'text-amber-400 border-amber-400';
      case 'comment': return 'text-indigo-300 border-indigo-400';
      case 'google_meet': return 'text-cyan-400 border-cyan-400';
      case 'follow_up': return 'text-sky-400 border-sky-400';
      case 'proposal': return 'text-fuchsia-400 border-fuchsia-400';
      case 'reservation': return 'text-indigo-400 border-indigo-400';
      case 'closing_deals': return 'text-emerald-400 border-emerald-400';
      case 'rent': return 'text-teal-400 border-teal-400';
      case 'cancel': return 'text-rose-400 border-rose-400';
      case 'task': return 'text-orange-400 border-orange-400';
      case 'note': return 'text-slate-300 border-slate-400';
      default: return 'text-gray-400 border-gray-400';
    }
  };

  function getTypeLabel(type) {
    switch (String(type).toLowerCase()) {
      case 'call': return isArabic ? '??????' : 'Call';
      case 'email': return isArabic ? '????' : 'Email';
      case 'meeting': return isArabic ? '??????' : 'Meeting';
      case 'whatsapp': return isArabic ? '??????' : 'WhatsApp';
      case 'sms': return isArabic ? '????? ????' : 'SMS';
      case 'comment': return isArabic ? '?????' : 'Comment';
      case 'google_meet': return isArabic ? '???? ???' : 'Google Meet';
      case 'follow_up': return isArabic ? '??????' : 'Follow Up';
      case 'proposal': return isArabic ? '??? ???' : 'Proposal';
      case 'reservation': return isArabic ? '???' : 'Reservation';
      case 'closing_deals': return isArabic ? '????? ????' : 'Close Deal';
      case 'rent': return isArabic ? '?????' : 'Rent';
      case 'cancel': return isArabic ? '?????' : 'Cancel';
      case 'task': return isArabic ? '????' : 'Task';
      case 'note': return isArabic ? '??????' : 'Note';
      default: return isArabic ? '??? ????' : 'Unknown';
    }
  }

  const toggleActionSelection = (actionId) => {
    setSelectedActions(prev =>
      prev.includes(actionId)
        ? prev.filter(id => id !== actionId)
        : [...prev, actionId]
    );
  };

  const pendingReplyCount = leadActions.filter(a => {
    if (!a.comments || a.comments.length === 0) return false;
    const lastComment = a.comments[a.comments.length - 1];
    // Check if last comment is NOT by current user
    const isMyComment = (lastComment.userId && String(lastComment.userId) === String(user?.id));
    return !isMyComment;
  }).length;

  const tabs = [
    { id: 'overview', label: isArabic ? 'نظرة عامة' : 'Overview' },
    { id: 'all-actions', label: (isArabic ? 'كل الإجراءات' : 'All Actions') + (pendingReplyCount > 0 ? ` (${pendingReplyCount})` : '') },
    { id: 'communication', label: isArabic ? 'التواصل' : 'Communication' },
    { id: 'attachments', label: isArabic ? 'المرفقات' : 'Attachments' }
  ];

  const getFileUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseApi = api?.defaults?.baseURL || '';
    const baseUrl = String(baseApi).replace(/\/api\/?$/i, '') || window.location.origin;
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${baseUrl}/storage/${cleanPath}`;
  };

  const getFileName = (path) => {
    if (!path) return '';
    return path.split('/').pop();
  };

  const isImage = (path) => {
    if (!path) return false;
    const ext = path.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  };

  // Determine if currently checked in (latest record has no checkOutDate)
  const latestCheckIn = checkInHistory.length > 0 ? checkInHistory[0] : null;
  const isCheckedIn = latestCheckIn && !latestCheckIn.checkOutDate;

  const handleCheckIn = () => {
    if (!navigator.geolocation) {
      alert(isArabic ? 'المتصفح لا يدعم تحديد الموقع' : 'Geolocation is not supported by your browser');
      return;
    }

    const toastEvent = new CustomEvent('app:toast', {
      detail: {
        type: 'info',
        message: isArabic ? 'جاري تحديد الموقع...' : 'Getting location...'
      }
    });
    window.dispatchEvent(toastEvent);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const payload = {
          lat: latitude,
          lng: longitude,
          address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        };

        if (isCheckedIn && latestCheckIn) {
          const body = {
            check_out_date: new Date().toISOString(),
            lat: payload.lat,
            lng: payload.lng,
            address: payload.address,
            status: 'completed'
          };

          api
            .put(`/api/visits/${latestCheckIn.id}`, body)
            .then(res => {
              const updated = res.data;
              setCheckInHistory(prev =>
                prev.map(item => (item.id === updated.id ? updated : item))
              );
              const successEvent = new CustomEvent('app:toast', {
                detail: {
                  type: 'success',
                  message: isArabic ? 'تم تسجيل الانصراف بنجاح' : 'Check-Out recorded successfully'
                }
              });
              window.dispatchEvent(successEvent);
            })
            .catch(error => {
              console.error('Error updating visit (check-out)', error);
              const errorEvent = new CustomEvent('app:toast', {
                detail: {
                  type: 'error',
                  message: isArabic ? 'فشل تسجيل الانصراف' : 'Failed to record check-out'
                }
              });
              window.dispatchEvent(errorEvent);
            });
        } else {
          const body = {
            type: 'lead',
            lead_id: lead?.id,
            customer_name: leadData.name,
            sales_person_name:
              lead?.sales_person ||
              lead?.assignedAgent?.name ||
              leadData?.salesPerson ||
              (isArabic ? 'غير محدد' : 'Unassigned'),
            check_in_date: new Date().toISOString(),
            lat: payload.lat,
            lng: payload.lng,
            address: payload.address
          };

          api
            .post('/api/visits', body)
            .then(res => {
              const created = res.data;
              setCheckInHistory(prev => [created, ...prev]);
              const successEvent = new CustomEvent('app:toast', {
                detail: {
                  type: 'success',
                  message: isArabic ? 'تم تسجيل الحضور بنجاح' : 'Check-In recorded successfully'
                }
              });
              window.dispatchEvent(successEvent);
            })
            .catch(error => {
              console.error('Error creating visit (check-in)', error);
              const errorEvent = new CustomEvent('app:toast', {
                detail: {
                  type: 'error',
                  message: isArabic ? 'فشل تسجيل الحضور' : 'Failed to record check-in'
                }
              });
              window.dispatchEvent(errorEvent);
            });
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = isArabic ? 'فشل تحديد الموقع' : 'Failed to get location';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = isArabic ? 'تم رفض إذن الموقع. يرجى تفعيل الموقع من إعدادات المتصفح.' : 'Location permission denied. Please enable location in browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = isArabic ? 'معلومات الموقع غير متوفرة.' : 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = isArabic ? 'انتهت مهلة طلب الموقع.' : 'The request to get user location timed out.';
            break;
          default:
            errorMessage = isArabic ? 'حدث خطأ غير معروف أثناء تحديد الموقع.' : 'An unknown error occurred getting location.';
            break;
        }

        const errorEvent = new CustomEvent('app:toast', {
          detail: {
            type: 'error',
            message: errorMessage
          }
        });
        window.dispatchEvent(errorEvent);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const isLight = theme === 'light';
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-0">
      <div className={`${isLight ? 'bg-white/70 backdrop-blur-md text-slate-800' : 'bg-slate-800 text-white'} w-full sm:max-w-5xl max-h-[95vh] sm:max-h-[85vh] h-auto sm:rounded-3xl overflow-y-auto shadow-2xl p-2 sm:p-4`}>
        {/* Header */}
        <div className={`${isLight ? 'bg-white/60 border-gray-200' : 'bg-slate-800 border-slate-700'} p-2 sm:p-4 border-b`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4 rtl:space-x-reverse">
              {/* Profile Picture */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-600 rounded-full flex items-center justify-center">
                <FaUser className="text-xl sm:text-2xl text-slate-300" />
              </div>

              {/* Lead Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className={`text-base sm:text-lg font-semibold mb-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>{leadData.name}</h2>
                  {/* Lead Seriousness Score Badge */}
                  <div 
                    title={isArabic ? 'تقييم جدية العميل (0-100)' : 'Lead Seriousness Score (0-100)'}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      (effectiveLead?.score || 50) >= 70 ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      (effectiveLead?.score || 50) >= 40 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                      'bg-red-500/20 text-red-400 border-red-500/30'
                    }`}
                  >
                    {effectiveLead?.score || 50}%
                  </div>
                </div>
                {false && crmSettings?.showMobileNumber !== false && (
                  <div className="mb-0.5 flex flex-col items-start gap-0.5">
                    {phoneEntries.length > 0 ? phoneEntries.map((entry, idx) => (
                      <div key={idx} className={`group flex max-w-[240px] items-center gap-1 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                        <span dir="ltr" className="min-w-0 truncate leading-4" title={entry.display}>{entry.display}</span>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#25D366] transition hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (entry?.digits) window.open(`https://wa.me/${entry.digits}`, '_blank');
                          }}
                          title={isArabic ? 'واتساب' : 'WhatsApp'}
                        >
                          <FaWhatsapp size={10} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-blue-600 transition hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (entry?.digits) window.open(`tel:${entry.digits}`, '_blank');
                          }}
                          title={isArabic ? 'مكالمة' : 'Call'}
                        >
                          <FaPhone size={9} />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center transition hover:opacity-80 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPhoneToClipboard(entry.display);
                          }}
                          title={isArabic ? 'نسخ' : 'Copy'}
                        >
                          <FaCopy size={9} />
                        </button>
                      </div>
                    )) : (
                      <p className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs`}>{leadData.phone}</p>
                    )}
                  </div>
                )}
                <p className={`${isLight ? 'text-slate-500' : 'text-slate-400'} text-[10px] sm:text-xs`}>{leadData.email}</p>
                {(phoneEntries.length > 0 || (leadData.phone && leadData.phone !== '-')) && (
                  <div className="mt-1 flex flex-col items-start gap-0.5">
                    {phoneEntries.length > 0 ? phoneEntries.map((entry, idx) => (
                      <div key={idx} className={`group flex max-w-[240px] items-center gap-1 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                        <span dir="ltr" className="min-w-0 truncate leading-4" title={entry.display}>{entry.display}</span>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#25D366] transition hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (entry?.digits) window.open(`https://wa.me/${entry.digits}`, '_blank');
                          }}
                          title={isArabic ? 'واتساب' : 'WhatsApp'}
                        >
                          <FaWhatsapp size={10} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-blue-600 transition hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (entry?.digits) window.open(`tel:${entry.digits}`, '_blank');
                          }}
                          title={isArabic ? 'مكالمة' : 'Call'}
                        >
                          <FaPhone size={9} />
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center transition hover:opacity-80 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPhoneToClipboard(entry.display);
                          }}
                          title={isArabic ? 'نسخ' : 'Copy'}
                        >
                          <FaCopy size={9} />
                        </button>
                      </div>
                    )) : (
                      <p className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs`}>{leadData.phone}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions Section */}
            <div className="flex flex-col items-end space-y-2 sm:space-y-3">
              {/* Action Buttons Row */}
              <div className="flex items-center justify-end gap-1 sm:gap-2 w-auto relative">
                {/* Removed Check-In Button from here */}
                {/* Removed preview toggle button */}
                <AddActionIconButton visible={canAddAction} onClick={() => setShowAddActionModal(true)} />
                {/* Assign (icon-only) */}
                {canAssignLeads && !(user?.role?.toLowerCase() === 'sales person' || user?.role?.toLowerCase() === 'salesperson') && !permissions?.is_referral_supervisor && (
                  <button
                    ref={assignMenuBtnRef}
                    onClick={() => setShowReAssignModal(true)}
                    aria-label={isArabic ? 'تعيين' : 'Assign'}
                    title={isArabic ? 'تعيين' : 'Assign'}
                    className="btn-icon relative"
                  >
                    <FaUserCheck className="text-sm" />
                  </button>
                )}
                {false && showAssignMenu && (
                  <div
                    ref={assignMenuRef}
                    className={`${isLight ? 'bg-white/90 backdrop-blur-md border border-gray-200 text-slate-800' : 'bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white'} absolute right-0 top-10 z-50 rounded-xl shadow-xl min-w-[200px] p-2`}
                  >
                    <div className="text-xs font-semibold px-3 py-2 text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      {assignStep === 'members' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignStep('teams');
                            setSelectedTeam(null);
                          }}
                          className="hover:text-blue-600"
                        >
                          {isArabic ? '←' : '←'}
                        </button>
                      )}
                      {assignStep === 'teams'
                        ? (isArabic ? 'اختر الفريق' : 'Select Team')
                        : (isArabic ? 'اختر الموظف' : 'Select Person')
                      }
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {assignStep === 'teams' ? (
                        Object.keys(TEAMS_DATA).map((team) => (
                          <button
                            key={team}
                            onClick={() => {
                              setSelectedTeam(team);
                              setAssignStep('members');
                            }}
                            className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-black/5 text-sm"
                          >
                            <span className="truncate">{team}</span>
                            <span className="text-xs text-gray-400">
                              ({TEAMS_DATA[team].length})
                            </span>
                          </button>
                        ))
                      ) : (
                        TEAMS_DATA[selectedTeam] && TEAMS_DATA[selectedTeam].length > 0 ? (
                          TEAMS_DATA[selectedTeam].map((assignee) => (
                            <button
                              key={assignee}
                              onClick={() => {
                                if (onAssign) onAssign(assignee);
                                setShowAssignMenu(false);
                                setAssignStep('teams');
                                setSelectedTeam(null);
                              }}
                              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-black/5 text-sm ${leadData.salesPerson === assignee ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}`}
                            >
                              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">
                                {assignee.charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate">{assignee}</span>
                              {leadData.salesPerson === assignee && <FaCheckCircle className="ml-auto text-xs" />}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500 italic">
                            {isArabic ? 'لا يوجد موظفين' : 'No sales persons found'}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
                {/* Edit Lead (icon-only) */}
                {canEditInfo && !permissions?.is_referral_supervisor && (
                  <button
                    onClick={() => setShowEditLeadModal(true)}
                    aria-label={isArabic ? 'تعديل' : 'Edit'}
                    title={isArabic ? 'تعديل' : 'Edit'}
                    className="btn-icon"
                  >
                    <FaEdit className="text-sm" />
                  </button>
                )}
                {/* Kebab Menu (three vertical dots) */}
                <button
                  ref={headerMenuBtnRef}
                  onClick={() => setShowHeaderMenu(prev => !prev)}
                  aria-label={isArabic ? 'المزيد' : 'More'}
                  title={isArabic ? 'المزيد' : 'More'}
                  className="btn-icon"
                >
                  <FaEllipsisV className="text-sm" />
                </button>
                {/* Dropdown Menu */}
                {showHeaderMenu && (
                  <div ref={headerMenuRef} className={`${isLight ? 'bg-white/70 backdrop-blur-md border border-gray-200 text-slate-800' : 'bg-slate-900/70 backdrop-blur-md border border-slate-700 text-white'} absolute right-12 top-10 z-50 rounded-xl shadow-xl min-w-[220px] p-2`}>

                    <button onClick={() => { setShowHeaderMenu(false); handleCheckIn(); }}
                      className="flex items-center justify-start text-start gap-3 w-full px-3 py-2 rounded-lg hover:bg-black/5 whitespace-nowrap">
                      {isCheckedIn ? <FaCheckCircle className="text-red-500 text-lg flex-shrink-0" /> : <FaMapMarkerAlt className="text-blue-500 text-lg flex-shrink-0" />}
                      <span className="text-sm font-medium">
                        {isCheckedIn
                          ? (isArabic ? 'تسجيل انصراف' : 'Check-Out')
                          : (isArabic ? 'تسجيل حضور' : 'Check-In')}
                      </span>
                    </button>

                    <button onClick={() => { setShowHeaderMenu(false); setShowPaymentPlanModal(true); }}
                      className="flex items-center justify-start text-start gap-3 w-full px-3 py-2 rounded-lg hover:bg-black/5 whitespace-nowrap">
                      <FaDollarSign className="text-emerald-500 text-lg flex-shrink-0" />
                      <span className="text-sm font-medium">
                        {isArabic
                          ? (paymentPlan ? 'تعديل خطة الدفع' : 'إضافة خطة دفع')
                          : (paymentPlan ? 'Edit Payment Plan' : 'Add Payment Plan')}
                      </span>
                    </button>

                    {canConvertToCustomer && (
                      <button
                        onClick={doConvertToCustomer}
                        disabled={convertCustomerLoading}
                        className="flex items-center justify-start text-start gap-3 w-full px-3 py-2 rounded-lg hover:bg-black/5 whitespace-nowrap">
                        <FaUserCheck className="text-yellow-500 text-lg flex-shrink-0" />
                        <span className="text-sm font-medium">
                          {convertCustomerLoading ? (isArabic ? 'جارٍ التحويل...' : 'Converting...') : (isArabic ? 'تحويل إلى عميل' : 'Convert to Customer')}
                        </span>
                      </button>
                    )}
                  </div>
                )}
                {/* Close (X) - stays far right */}
                <button
                  onClick={onClose}
                  aria-label={isArabic ? 'إغلاق' : 'Close'}
                  className="btn-icon"
                >
                  <FaTimes className="text-lg" />
                </button>
              </div>
              <div className="w-full h-px"></div>

              {/* Status Badges Row */}
              <div className="flex flex-wrap justify-end gap-1 sm:gap-6 rtl:space-x-reverse">
                {/* Supervisor Mode Badge */}
                {permissions.is_referral_supervisor && (
                  <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-purple-600 text-white text-[10px] sm:text-sm rounded-full font-medium shadow-md animate-pulse">
                    {isArabic ? 'مشرف إحالة' : 'Supervisor Mode'}
                  </span>
                )}
                {/* Stage Badge */}
                {(() => {
                  const { style, className } = getStageStyle(leadData.stage);
                  return (
                    <span className={`${className} px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-sm rounded-full font-medium`} style={style}>
                      {leadData.stage || 'N/A'}
                    </span>
                  );
                })()}

                {/* Priority Badge */}
                <span className={`px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-sm rounded-full font-medium border ${getPriorityColor(leadData.priority)}`}>
                  {leadData.priority || 'N/A'}
                </span>

                {/* Sales Person Badge */}
                <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-500 text-white text-[10px] sm:text-sm rounded-full font-medium">
                  {leadData.salesPerson || 'Unassigned'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <EditLeadModal
          isOpen={showEditLeadModal}
          onClose={() => setShowEditLeadModal(false)}
          onSave={(updatedLead) => { }}
          lead={lead}
          canEditInfo={canEditInfo}
          canEditPhone={canEditPhone}
        />

        {showAddActionModal && (
          <div className="px-0 sm:px-0">
            <AddActionModal
              isOpen={showAddActionModal}
              onClose={() => setShowAddActionModal(false)}
              onSave={handleAddAction}
              lead={effectiveLead}
              isOwnerProp={isOwner}
              isSuperAdminProp={user?.is_super_admin}
              inline={true}
              initialType={actionType}
            />
          </div>
        )}

        <PaymentPlanModal
          isOpen={showPaymentPlanModal}
          onClose={() => setShowPaymentPlanModal(false)}
          onSave={(plan) => {
            const meta = (lead && typeof lead === 'object' && lead.meta_data && typeof lead.meta_data === 'object') ? lead.meta_data : {}
            const nextMeta = { ...meta, payment_plan: plan }
            const updatedLead = { ...lead, paymentPlan: plan, meta_data: nextMeta }
            setPaymentPlan(plan)
            if (onUpdateLead) onUpdateLead(updatedLead)
            const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم حفظ خطة الدفع' : 'Payment plan saved' } });
            void evt
            ;(async () => {
              try {
                if (lead?.id) {
                  await api.put(`/api/leads/${encodeURIComponent(lead.id)}`, { meta_data: nextMeta })
                }
                window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم حفظ خطة الدفع' : 'Payment plan saved' } }))
              } catch (e) {
                const msg = e?.response?.data?.message || (isArabic ? 'فشل حفظ خطة الدفع' : 'Failed to save payment plan')
                window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'error', message: msg } }))
              }
            })()
          }}
          lead={lead}
        />



        <CreateRequestModal
          open={showCreateRequestModal}
          onClose={() => setShowCreateRequestModal(false)}
          onSave={(payload) => {
            const evt = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم إرسال الطلب بنجاح' : 'Request sent successfully', source: 'lead' } });
            window.dispatchEvent(evt);
          }}
          initial={{ customerName: leadData.name || '', assignedTo: leadData.salesPerson || '' }}
          isRTL={isArabic}
        />

        {/* Tabs */}
        <div className={`${isLight ? 'bg-white/60 border-gray-200' : 'bg-slate-800 border-slate-700'} px-0 sm:px-6 border-b ${showAddActionModal ? 'hidden' : ''}`}>
          <div className="flex justify-between w-full">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 sm:py-4 px-2 sm:px-4 text-[10px] sm:text-sm font-medium border-b-2 transition-all duration-200 text-center ${activeTab === tab.id
                  ? `${isLight ? 'border-emerald-500 text-slate-900 bg-emerald-50 rounded-t-lg shadow-lg shadow-emerald-200/50 font-semibold' : 'border-emerald-400 text-white bg-emerald-500/20 rounded-t-lg shadow-lg shadow-emerald-500/10 font-semibold'}`
                  : `${isLight ? 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100' : 'border-transparent text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-700/30'}`
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto p-2 sm:p-6 ${isLight ? 'bg-white/70' : 'bg-slate-800'} ${showAddActionModal ? 'hidden' : ''}`}>
          {activeTab === 'overview' && (
            <div className="space-y-3 sm:space-y-8">
              {leadLeakDiagnostic && (
                <div className={`rounded-2xl border p-4 sm:p-5 ${isLight ? 'border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50' : 'border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-blue-500/10'}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${isLight ? 'text-violet-700' : 'text-violet-300'}`}>
                          {isArabic ? 'تشخيص تسريب المبيعات' : 'Sales Leakage Audit'}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          leadLeakDiagnostic.risk_level === 'high'
                            ? 'bg-red-100 text-red-700'
                            : leadLeakDiagnostic.risk_level === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isArabic ? 'المخاطر' : 'Risk'}: {leadLeakDiagnostic.risk_level || '-'}
                        </span>
                      </div>
                      <div className={`mt-2 text-3xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {leadLeakDiagnostic.score ?? 0}/100
                      </div>
                      <div className={`mt-2 flex flex-wrap gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                        {(leadLeakDiagnostic.top_leaks || []).map((leak) => (
                          <span key={leak} className={`rounded-full border px-2.5 py-1 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-600 bg-slate-800'}`}>
                            {String(leak).replaceAll('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    {leadLeakDiagnostic.report?.path && (
                      <a
                        href={getFileUrl(leadLeakDiagnostic.report.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                      >
                        <FaFileAlt />
                        {isArabic ? 'فتح التقرير الكامل' : 'Open Full Report'}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {/* Two Column: Current Status (left) and Lead Information (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-8">
                {/* Left: Current Status */}
                <div>
                  <h3 className={`${isLight ? 'text-black border-gray-300' : 'text-white border-slate-700'} font-semibold mb-3 border-b pb-2 text-left`}>
                    {isArabic ? 'الحالة الحالية' : 'Current Status'}
                  </h3>
                  <div className="flex justify-around sm:justify-start items-center gap-2 sm:gap-16 mb-4 sm:mb-6">
                    {/* Stat 1 - Dark circle with 3 and "Total Actions" label */}
                    <div className="flex flex-col items-center">
                      <div className="relative w-14 h-14 sm:w-24 sm:h-24 rounded-full mb-1 sm:mb-2 bg-[conic-gradient(#34d399_0_12%,_#334155_12%)]">
                        <div className={`absolute inset-2 rounded-full flex items-center justify-center ${isLight ? 'bg-white border border-gray-300' : 'bg-slate-700 border border-slate-600'}`}>
                          <span className={`text-base sm:text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                            {cardsLoading ? '...' : actionStats.total}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isArabic ? 'إجمالي الإجراءات' : 'Total Actions'}
                      </span>
                    </div>

                    {/* Stat 2 - Green circle with 2 and "Completed" label */}
                    <div className="flex flex-col items-center">
                      <div className="relative w-14 h-14 sm:w-24 sm:h-24 rounded-full mb-1 sm:mb-2 bg-[conic-gradient(#10b981_0_100%)]">
                        <div className={`absolute inset-2 rounded-full flex items-center justify-center ${isLight ? 'bg-white border border-emerald-300' : 'bg-slate-700 border border-emerald-400'}`}>
                          <span className={`text-base sm:text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                            {cardsLoading ? '...' : actionStats.completed}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isArabic ? 'مكتملة' : 'Completed'}
                      </span>
                    </div>

                    {/* Stat 3 - Orange circle with 1 and "Delay" label */}
                    <div className="flex flex-col items-center">
                      <div className="relative w-14 h-14 sm:w-24 sm:h-24 rounded-full mb-1 sm:mb-2 bg-[conic-gradient(#f59e0b_0_100%)]">
                        <div className={`absolute inset-2 rounded-full flex items-center justify-center ${isLight ? 'bg-white border border-orange-300' : 'bg-slate-700 border border-orange-400'}`}>
                          <span className={`text-base sm:text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                            {cardsLoading ? '...' : actionStats.delay}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isArabic ? 'المتأخرات' : 'Delay'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                    <div className="space-y-3 mt-4 sm:mt-6">
                      <h4 className={`${isLight ? 'text-black border-gray-300' : 'text-white border-slate-700'} font-semibold mb-2 sm:mb-3 border-b pb-2`}>
                        {isArabic ? 'إجراءات سريعة' : 'Quick Actions'}
                      </h4>
                      <input
                        ref={leadAttachmentInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleLeadAttachmentsSelected}
                      />
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 rtl:flex-row-reverse">
                        {canAddAction && (
                          <button
                            onClick={() => setShowAddActionModal(true)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-full font-medium transition-colors flex items-center justify-center gap-2 flex-grow sm:flex-grow-0"
                          >
                            <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-400 flex items-center justify-center">
                              <FaPlus className="text-[10px] sm:text-xs" />
                            </span>
                            <span className="text-xs sm:text-sm whitespace-nowrap">
                              {isArabic ? '+ إضافة إجراء جديد' : '+ Add New Action'}
                            </span>
                          </button>
                        )}
                      <button
                        onClick={handlePickLeadAttachments}
                        disabled={uploadingLeadAttachments}
                        className={`${isLight ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'} ${uploadingLeadAttachments ? 'opacity-70 cursor-not-allowed' : ''} text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-full font-medium transition-colors flex items-center justify-center gap-2 flex-grow sm:flex-grow-0`}
                      >
                        <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-400 flex items-center justify-center">
                          <FaPaperclip className="text-[10px] sm:text-xs" />
                        </span>
                        <span className="text-xs sm:text-sm whitespace-nowrap">{isArabic ? 'إضافة مرفق' : 'Add Attachment'}</span>
                      </button>
                      {canConvertToCustomer && (
                        <button
                          onClick={doConvertToCustomer}
                          disabled={convertCustomerLoading}
                          className={`${isLight ? 'bg-white text-slate-700 border border-gray-300 hover:bg-slate-100' : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600'} py-1.5 sm:py-2 px-3 sm:px-4 rounded-full font-medium transition-colors flex items-center justify-center gap-2 flex-grow sm:flex-grow-0`}
                        >
                          <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-yellow-600 flex items-center justify-center">
                            <FaUserCheck className="text-[10px] sm:text-xs text-white" />
                          </span>
                          <span className="text-xs sm:text-sm whitespace-nowrap">{isArabic ? 'تحويل لعميل' : 'To Customer'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Lead Information */}
                <div className="space-y-2 sm:space-y-4">
                  <h3 className={`text-base sm:text-lg font-semibold mb-2 sm:mb-4 border-b pb-2 ${isLight ? 'text-black border-gray-300' : 'text-white border-slate-700'}`}>
                    {isArabic ? 'بيانات العميل' : 'Lead Information'}
                  </h3>
                  <div className={`space-y-2 sm:space-y-4 p-2 sm:p-4 rounded-lg ${isLight ? 'bg-white border border-gray-200' : 'bg-slate-700'}`}>
                    {leadInformationRows.filter((row) => row.key !== 'phone').map((row) => (
                      <div
                        key={row.key}
                        className={`flex justify-between gap-3 ${row.multiline ? 'items-start' : 'items-center'}`}
                      >
                        <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm ${row.multiline ? 'whitespace-nowrap' : ''}`}>
                          {row.label}
                        </span>
                        <span
                          className={`${isLight ? 'text-black' : 'text-white'} text-xs sm:text-sm text-right ${row.multiline ? 'whitespace-pre-line break-words' : ''} ${row.key === 'project' || row.key === 'item' ? 'font-medium' : ''}`}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>


                </div>
              </div>

              {/* Payment Plan Information */}
              {paymentPlan && (
                <>
                  <h3 className={`text-base sm:text-lg font-semibold mb-2 sm:mb-4 mt-4 sm:mt-6 border-b pb-2 ${isLight ? 'text-black border-gray-300' : 'text-white border-slate-700'}`}>
                    {isArabic ? 'خطة الدفع' : 'Payment Plan'}
                  </h3>
                  <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 p-3 sm:p-6 rounded-lg ${isLight ? 'bg-white border border-gray-200' : 'bg-slate-700'}`}>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'المشروع:' : 'Project:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.projectName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'رقم الوحدة:' : 'Unit No:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.unitNo || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'سعر الوحدة:' : 'Unit Price:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.totalAmount ? Number(paymentPlan.totalAmount).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'الجراج:' : 'Garage:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.garageAmount ? Number(paymentPlan.garageAmount).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'الصيانة:' : 'Maintenance:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.maintenanceAmount ? Number(paymentPlan.maintenanceAmount).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'صافي المبلغ:' : 'Net Amount:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-bold text-sm sm:text-lg`}>{paymentPlan.netAmount ? Number(paymentPlan.netAmount).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'المقدم:' : 'Down Payment:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.downPayment ? Number(paymentPlan.downPayment).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'أقساط إضافية:' : 'Extra Installments:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.extraInstallments ? Number(paymentPlan.extraInstallments).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'قيمة القسط:' : 'Installment:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.installmentAmount ? Number(paymentPlan.installmentAmount).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-xs sm:text-sm`}>{isArabic ? 'عدد الأشهر:' : 'Months:'}</span>
                      <span className={`${isLight ? 'text-black' : 'text-white'} font-medium text-sm sm:text-lg`}>{paymentPlan.noOfMonths || '0'}</span>
                    </div>
                  </div>
                </>
              )}

              {/* Check-In History Table */}
              <div className="mt-4 sm:mt-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`text-base sm:text-lg font-semibold ${isLight ? 'text-black border-gray-300' : 'text-white border-slate-700'}`}>
                    {isArabic ? 'سجل الزيارات' : 'Check-In History'}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (window.confirm(isArabic ? 'هل أنت متأكد من مسح جميع سجلات الزيارة؟' : 'Are you sure you want to clear all check-in history?')) {
                          localStorage.removeItem('checkInReports');
                          setCheckInHistory([]);
                          const toast = new CustomEvent('app:toast', { detail: { type: 'success', message: isArabic ? 'تم مسح السجل بنجاح' : 'History cleared successfully' } });
                          window.dispatchEvent(toast);
                        }
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title={isArabic ? 'مسح السجل' : 'Clear History'}
                    >
                      <FaTrash />
                    </button>
                    <span className={`text-xs sm:text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>{isArabic ? 'تاريخ:' : 'Date:'}</span>
                    <input
                      type="date"
                      value={historyDateFilter}
                      onChange={(e) => setHistoryDateFilter(e.target.value)}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-lg border focus:outline-none ${isLight ? 'bg-white border-gray-300 text-black' : 'bg-slate-600 border-slate-500 text-white'}`}
                    />
                  </div>
                </div>

                <div className={`overflow-x-auto rounded-lg border ${isLight ? 'border-gray-200' : 'border-slate-600'}`}>
                  <table className={`w-full text-xs sm:text-sm text-left ${isArabic ? 'text-right' : ''} ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                    <thead className={`text-[10px] sm:text-xs uppercase ${isLight ? 'bg-gray-50 text-slate-700' : 'bg-slate-700 text-slate-300'}`}>
                      <tr>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap">{isArabic ? 'الموظف' : 'Sales Person'}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap">{isArabic ? 'وقت الحضور' : 'Check-In Time'}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap">{isArabic ? 'وقت الانصراف' : 'Check-Out Time'}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap">{isArabic ? 'موقع الحضور' : 'Check-In Location'}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap">{isArabic ? 'موقع الانصراف' : 'Check-Out Location'}</th>
                        <th className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap">{isArabic ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-600">
                      {filteredCheckInHistory.length > 0 ? (
                        filteredCheckInHistory.map((item) => (
                          <tr key={item.id} className={`${isLight ? 'bg-white hover:bg-gray-50' : 'bg-slate-800 hover:bg-slate-700'}`}>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium whitespace-nowrap dark:text-white">
                              {(() => {
                                let displayName = item.salesPerson;
                                // If numeric or looks like ID, try to lookup
                                if (usersList && usersList.length > 0 && (!displayName || !isNaN(displayName))) {
                                  const user = usersList.find(u => u.id == displayName);
                                  if (user) displayName = user.name;
                                }
                                return displayName || '-';
                              })()}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span>{new Date(item.checkInDate).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US')}</span>
                                <span className="text-[10px] sm:text-xs text-gray-500">{new Date(item.checkInDate).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                              {item.checkOutDate ? (
                                <div className="flex flex-col">
                                  <span>{new Date(item.checkOutDate).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US')}</span>
                                  <span className="text-[10px] sm:text-xs text-gray-500">{new Date(item.checkOutDate).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="truncate max-w-[100px] sm:max-w-[150px]" title={item.location?.address || `${item.location?.lat}, ${item.location?.lng}`}>
                                  {item.location?.address || formatCoordinatePair(item.location)}
                                </span>
                                {item.location && (item.location.lat || item.location.address) && (
                                  <button
                                    onClick={() => {
                                      const url = item.location.lat && item.location.lng
                                        ? `https://www.google.com/maps/search/?api=1&query=${item.location.lat},${item.location.lng}`
                                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location.address)}`;
                                      window.open(url, '_blank');
                                    }}
                                    className="px-2 py-1 text-[10px] sm:text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors flex items-center gap-1"
                                    title={isArabic ? 'عرض موقع الحضور' : 'Preview Check-In Location'}
                                  >
                                    <FaMapMarkerAlt />
                                    {isArabic ? 'عرض' : 'Preview'}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="truncate max-w-[100px] sm:max-w-[150px]" title={item.checkOutLocation?.address || `${item.checkOutLocation?.lat}, ${item.checkOutLocation?.lng}`}>
                                  {item.checkOutLocation?.address || formatCoordinatePair(item.checkOutLocation)}
                                </span>
                                {item.checkOutLocation && (item.checkOutLocation.lat || item.checkOutLocation.address) && (
                                  <button
                                    onClick={() => {
                                      const url = item.checkOutLocation.lat && item.checkOutLocation.lng
                                        ? `https://www.google.com/maps/search/?api=1&query=${item.checkOutLocation.lat},${item.checkOutLocation.lng}`
                                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.checkOutLocation.address)}`;
                                      window.open(url, '_blank');
                                    }}
                                    className="px-2 py-1 text-[10px] sm:text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors flex items-center gap-1"
                                    title={isArabic ? 'عرض موقع الانصراف' : 'Preview Check-Out Location'}
                                  >
                                    <FaMapMarkerAlt />
                                    {isArabic ? 'عرض' : 'Preview'}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 text-[10px] sm:text-xs rounded-full ${item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                {item.status === 'pending'
                                  ? (isArabic ? 'تشيك ان' : 'Check-In')
                                  : item.status === 'completed'
                                    ? (isArabic ? 'تشيك اوت' : 'Check-Out')
                                    : (item.status || '-')
                                }
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                            {isArabic ? 'لا توجد سجلات زيارة' : 'No check-in history found'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>


            </div>
          )}

          {/* Other tab contents */}
          {activeTab === 'all-actions' && (
            <div className="space-y-6">
              {/* Type cards: All Actions / Calls Done / Messages / Meetings */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <button
                  onClick={() => { setFilterType('all'); setFilterStatus('all'); }}
                  className={`${isLight ? 'bg-white border border-gray-200 hover:bg-slate-100' : 'bg-slate-700 border border-slate-600 hover:bg-slate-600'} p-5 rounded-xl text-center transition-colors`}
                >
                  <div className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{leadActions.length}</div>
                  <div className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-sm`}>{isArabic ? 'كل الإجراءات' : 'All Actions'}</div>
                </button>
                <button
                  onClick={() => { setFilterType('call'); setFilterStatus('completed'); }}
                  className={`${isLight ? 'bg-white border border-green-300 hover:bg-slate-100' : 'bg-slate-700 border border-green-600 hover:bg-slate-600'} p-5 rounded-xl text-center transition-colors`}
                >
                  <div className="text-2xl font-bold text-green-400">{leadActions.filter(a => String(a.type).toLowerCase() === 'call').length}</div>
                  <div className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-sm`}>{isArabic ? 'مكالمات مكتملة' : 'Calls Done'}</div>
                </button>
                <button
                  onClick={() => { setFilterType('email'); setFilterStatus('all'); }}
                  className={`${isLight ? 'bg-white border border-blue-300 hover:bg-slate-100' : 'bg-slate-700 border border-blue-600 hover:bg-slate-600'} p-5 rounded-xl text-center transition-colors`}
                >
                  <div className="text-2xl font-bold text-blue-400">{leadActions.filter(a => ['email', 'whatsapp', 'sms'].includes(String(a.type).toLowerCase())).length}</div>
                  <div className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-sm`}>{isArabic ? 'الرسائل' : 'Messages'}</div>
                </button>
                <button
                  onClick={() => { setFilterType('meeting'); setFilterStatus('all'); }}
                  className={`${isLight ? 'bg-white border border-purple-300 hover:bg-slate-100' : 'bg-slate-700 border border-purple-600 hover:bg-slate-600'} p-5 rounded-xl text-center transition-colors`}
                >
                  <div className="text-2xl font-bold text-purple-400">{leadActions.filter(a => String(a.type).toLowerCase() === 'meeting' || String(a.next_action_type).toLowerCase() === 'meeting').length}</div>
                  <div className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-sm`}>{isArabic ? 'الاجتماعات' : 'Meetings'}</div>
                </button>
              </div>

              {/* Simple header with Add button */}
              <div className="flex items-center justify-between mb-2">
                <h3 className={`${isLight ? 'text-black' : 'text-white'} font-semibold`}>{isArabic ? 'الإجراءات' : 'Actions'}</h3>
                <div className="flex items-center gap-2">
                  {false && typeof onImportHistory === 'function' && (
                    <button
                      onClick={() => onImportHistory(effectiveLead || lead)}
                      className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <FaHistory />
                      {isArabic ? 'استيراد الهيستوري' : 'Import History'}
                    </button>
                  )}
                  {canAddAction && (
                    <button
                      onClick={() => setShowAddActionModal(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <FaPlus />
                      {isArabic ? 'إضافة إجراء جديد' : 'Add New Action'}
                    </button>
                  )}
                </div>
              </div>

              {/* Search and Filters (Status & Type) */}
              <div className={`${isLight ? 'bg-white border border-gray-200' : 'bg-slate-700'} p-4 rounded-lg space-y-3 mb-2`}>
                <div className="flex flex-row gap-3 items-center">
                  <div className="flex-1 relative w-full">
                    <FaSearch className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      placeholder={isArabic ? 'البحث في الإجراءات...' : 'Search actions...'}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 rounded-lg placeholder-slate-400 focus:outline-none ${isLight ? 'bg-white border border-gray-300 text-black focus:border-emerald-500' : 'bg-slate-600 border border-slate-500 text-white focus:border-emerald-400'}`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className={`rounded-lg px-3 py-2 text-sm focus:outline-none ${isLight ? 'bg-white border border-gray-300 text-black focus:border-emerald-500' : 'bg-slate-600 border border-slate-500 text-white focus:border-emerald-400'}`}
                    >
                      <option value="all">{isArabic ? 'جميع الأنواع' : 'All types'}</option>
                      <option value="call">{isArabic ? 'مكالمة' : 'Call'}</option>
                      <option value="email">{isArabic ? 'بريد' : 'Email'}</option>
                      <option value="meeting">{isArabic ? 'اجتماع' : 'Meeting'}</option>
                      <option value="task">{isArabic ? 'مهمة' : 'Task'}</option>
                      <option value="note">{isArabic ? 'ملاحظة' : 'Note'}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions List */}
              <div className="space-y-4">
                {filteredActions.length === 0 ? (
                  /* Empty State */
                  <div className={`text-center py-12 rounded-lg ${isLight ? 'bg-white border border-gray-200' : 'bg-slate-700'}`}>
                    <FaList className={`mx-auto text-4xl mb-4 ${isLight ? 'text-slate-500' : 'text-slate-500'}`} />
                    <h3 className={`text-lg font-medium mb-2 ${isLight ? 'text-black' : 'text-slate-300'}`}>
                      {isArabic ? 'لا توجد إجراءات' : 'No actions'}
                    </h3>
                    <p className={`${isLight ? 'text-slate-600' : 'text-slate-400'} mb-4`}>
                      {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                        ? (isArabic
                            ? 'لم يتم العثور على إجراءات تطابق البحث أو الفلاتر المحددة.'
                            : 'No actions match your search or selected filters.')
                        : (isArabic
                            ? 'لم يتم إنشاء أي إجراءات بعد.'
                            : 'No actions have been created yet.')
                      }
                    </p>
                    {canAddAction && (
                      <button
                        onClick={() => setShowAddActionModal(true)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        <FaPlus className="inline mr-2" />
                        {isArabic ? 'إضافة أول إجراء' : 'Add First Action'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-xl overflow-hidden ${isLight ? 'bg-white border border-gray-200 divide-y divide-gray-300' : 'border border-slate-600 divide-y divide-slate-600'}`}>
                    {filteredActions.map((action) => (
                      <div
                        key={action.id}
                        id={`action-${action.id}`}
                        className={`flex items-start gap-4 p-4 transition-colors ${isLight ? 'bg-white hover:bg-slate-50' : 'bg-slate-700 hover:bg-slate-600'} ${selectedActions.includes(action.id) ? (isLight ? 'bg-emerald-50' : 'bg-emerald-500/5') : ''}`}
                      >
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${isLight ? 'bg-slate-200' : 'bg-slate-600'}`}>
                          {getActionIcon(action.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`${isArabic ? 'text-right' : ''}`}>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'اسم العميل:' : 'Lead Name:'}</span>
                                <span className={`${isLight ? 'text-black' : 'text-white'} font-semibold max-w-[220px] break-words`}>{leadData.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'المرحلة:' : 'Stage:'}</span>
                                {(() => {
                                  const actionStage = getActionStage(action);
                                  const { style, className } = getStageStyle(actionStage);
                                  return <span className={className} style={style}>{actionStage}</span>;
                                })()}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'الأولوية:' : 'Priority:'}</span>
                                {(() => {
                                  const displayPriority = leadData?.priority || action.priority || 'medium';
                                  return (
                                    <span className={`px-2 py-1 rounded border text-xs ${getPriorityColor(displayPriority)}`}>
                                      {isArabic
                                        ? (displayPriority === 'high' ? 'عالية' : displayPriority === 'medium' ? 'متوسطة' : 'منخفضة')
                                        : (displayPriority === 'high' ? 'High' : displayPriority === 'medium' ? 'Medium' : 'Low')}
                                    </span>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'نوع الإجراء:' : 'Action Type:'}</span>
                                <span className={`px-2 py-1 rounded border text-xs ${getTypeColor(resolveActionType(action))}`}>{getTypeLabel(resolveActionType(action))}</span>
                              </div>
                              {/* Meeting Status Display */}
                              {(String(action.type || '').toLowerCase() === 'meeting' || String(action.next_action_type || '').toLowerCase() === 'meeting') && action.details?.meeting_status && (
                                <div className="flex items-center gap-1">
                                  <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'حالة الاجتماع:' : 'Meeting Status:'}</span>
                                  <span className={`px-2 py-1 rounded border text-xs font-bold ${
                                    action.details.meeting_status === 'done' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                    action.details.meeting_status === 'no_show' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                    action.details.meeting_status === 'cancelled' ? 'bg-gray-500/10 text-gray-500 border-gray-500/20' :
                                    'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                  }`}>
                                    {(() => {
                                      const s = action.details.meeting_status;
                                      if (isArabic) {
                                        if (s === 'scheduled') return 'مجدول';
                                        if (s === 'done') return 'تم بنجاح';
                                        if (s === 'no_show') return 'لم يحضر (ميسد)';
                                        if (s === 'cancelled') return 'ملغي';
                                      }
                                      return String(s).charAt(0).toUpperCase() + String(s).slice(1).replace('_', ' ');
                                    })()}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-1 min-w-0">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'مسؤول المبيعات:' : 'Sales Person:'}</span>
                                <span className={`${isLight ? 'text-slate-800' : 'text-slate-300'} max-w-[200px] break-words`}>
                                  {leadData.salesPerson || (isArabic ? 'غير محدد' : 'Not specified')}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 min-w-0">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'قام بالإجراء:' : 'Action By:'}</span>
                                <span className={`${isLight ? 'text-slate-800' : 'text-slate-300'} max-w-[260px] break-words`}>
                                  {(() => {
                                    const actorName = String(action.user || '').trim();
                                    const actorRole = String(action.userRole || '').trim();
                                    if (!actorRole) return actorName;
                                    if (!actorName) return actorRole;
                                    if (actorName.toLowerCase() === actorRole.toLowerCase()) return actorName;
                                    return `${actorName} (${actorRole})`;
                                  })()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 min-w-0">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'تاريخ الإجراء:' : 'Action Date:'}</span>
                                <span className={`${isLight ? 'text-slate-800' : 'text-slate-300'} whitespace-nowrap`}>
                                  {formatActionDateTime(action.created_at)}
                                </span>
                              </div>
                              {getScheduledNextActionDateTime(action) ? (
                              <div className="flex items-center gap-1">
                                <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs`}>{isArabic ? 'الموعد القادم:' : 'Scheduled Next Action:'}</span>
                                <span className={`${isLight ? 'text-slate-800' : 'text-slate-300'} whitespace-nowrap`}>
                                  {getScheduledNextActionDateTime(action)}
                                </span>
                              </div>
                              ) : null}
                            </div>
                          <div className="mt-2 w-full">
                            {(() => {
                              const actionType = String(action.type || action.action_type || '').toLowerCase();
                              const isNoteAction = actionType === 'note';
                              const isMeetingAction = actionType === 'meeting' || String(action.next_action_type || '').toLowerCase() === 'meeting';
                              const primaryText = isNoteAction
                                ? (action.notes || action.description)
                                : isMeetingAction
                                  ? (action.notes || action.description)
                                  : (action.description || action.notes);
                              if (!primaryText) return null;
                              return (
                                <>
                                  <div className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs mb-1`}>
                                    {isNoteAction ? (isArabic ? 'الملاحظات:' : 'Notes:') : (isArabic ? 'التعليق:' : 'Comment:')}
                                  </div>
                                  <div className={`${isLight ? 'text-black' : 'text-slate-300'} text-sm break-words whitespace-pre-line mb-4`}>
                                    {primaryText}
                                  </div>
                                </>
                              );
                            })()}

                            {/* Comments Section */}
                            <div className={`mt-4 pt-4 border-t ${isLight ? 'border-gray-200' : 'border-slate-600'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <h5 className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                  {isArabic ? 'التعليقات' : 'Comments'} ({action.comments ? action.comments.length : 0})
                                </h5>
                                {action.comments && action.comments.length > 0 && (
                                  <button
                                    onClick={() => setExpandedComments(prev => ({ ...prev, [action.id]: !prev[action.id] }))}
                                    className={`text-xs flex items-center gap-1 ${isLight ? 'text-blue-600 hover:text-blue-800' : 'text-blue-400 hover:text-blue-300'}`}
                                  >
                                    {expandedComments[action.id] ? (isArabic ? 'إخفاء' : 'Hide') : (isArabic ? 'إظهار' : 'Show')}
                                    <FaChevronDown className={`transform transition-transform ${expandedComments[action.id] ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </div>
                              
                              {/* Comments List */}
                              {expandedComments[action.id] && action.comments && action.comments.length > 0 ? (
                                <div className="space-y-3 mb-4 max-h-52 overflow-y-auto pr-1">
                                  {action.comments.map((comment, idx) => (
                                    <div key={comment.id || idx} className={`flex gap-3 ${isLight ? 'bg-gray-50' : 'bg-slate-800'} p-3 rounded-lg`}>
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                        (comment.role || '').toLowerCase().includes('manager') ? 'bg-purple-500' :
                                        (comment.role || '').toLowerCase().includes('referral') ? 'bg-orange-500' :
                                        'bg-blue-500'
                                      }`}>
                                        {(comment.user || 'U').charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <span className={`text-xs font-bold block ${isLight ? 'text-slate-800' : 'text-white'}`}>{comment.user}</span>
                                            <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{comment.role || 'User'}</span>
                                          </div>
                                          <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {new Date(comment.createdAt).toLocaleString(isArabic ? 'ar-EG' : 'en-US')}
                                          </span>
                                        </div>
                                        <p className={`text-xs mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{comment.text}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {/* Add Comment Input */}
                              {(() => {
                                // RBAC Logic
                                const role = (user?.role || '').toLowerCase();
                                const isManager = ['admin', 'manager', 'director', 'owner', 'super admin', 'superadmin'].some(r => role.includes(r));
                                const isReferral = role.includes('referral');
                                const isAssigned = lead?.assigned_to == user?.id || lead?.assignedTo == user?.id || 
                                                   (leadData.salesPerson === user?.name);
                                
                                const canComment = isManager || isReferral || isAssigned || user?.is_super_admin;

                                if (!canComment) return null;

                                return (
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={commentInputs[action.id] || ''}
                                      onChange={(e) => setCommentInputs(prev => ({ ...prev, [action.id]: e.target.value }))}
                                      placeholder={isArabic ? 'أضف تعليقاً...' : 'Add a comment...'}
                                      className={`flex-1 text-xs px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                                        isLight ? 'bg-white border-gray-300 text-black' : 'bg-slate-600 border-slate-500 text-white'
                                      }`}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handleActionCommentSubmit(action.id, commentInputs[action.id]);
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleActionCommentSubmit(action.id, commentInputs[action.id])}
                                      disabled={commentSubmitting[action.id] || !commentInputs[action.id]?.trim()}
                                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                        commentSubmitting[action.id] || !commentInputs[action.id]?.trim()
                                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                          : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                      }`}
                                    >
                                      {commentSubmitting[action.id] ? (isArabic ? '...' : '...') : (isArabic ? 'إرسال' : 'Post')}
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          {(() => {
                            const extra = getActionExtraFields(action);
                            if (!extra || extra.length === 0) return null;
                            return (
                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {extra.map(field => (
                                  <div key={field.key} className="text-xs">
                                    <span className={`${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{field.label}: </span>
                                    <span className={`${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{field.value}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          </div>
                        </div>
                        {/* Removed trailing preview/edit buttons */}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'communication' && (
            <div className="p-8 space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                    <div className="bg-blue-500 p-2 rounded-xl mr-3 ml-3 rtl:mr-0 rtl:ml-3">
                      <FaComments className="text-white text-sm" />
                    </div>
                    {isArabic ? 'التواصل مع العميل' : 'Client Communication'}
                    {unreadComm > 0 && <span className="mx-3 bg-red-500 text-white text-xs px-2 py-1 rounded-full">{unreadComm}</span>}
                  </h3>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <button className="p-2 text-gray-500 hover:text-blue-500 transition-colors">
                      <FaFilter />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Actions (ordered: Call / WhatsApp / Email / Google Meet) */}
              {canAddAction && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {crmSettings?.showMobileNumber !== false && (
                  <>
                    <button
                      onClick={() => {
                        const digits = phoneEntries?.[0]?.digits || getPhoneDigits(lead?.phone || lead?.mobile || '', {
                          defaultCountryCode: getLeadDefaultCountryCode(effectiveLead),
                        })
                        if (digits) window.open(`tel:${digits}`, '_blank')
                      }}
                      className={`${isLight ? 'bg-white/70 backdrop-blur-md text-slate-800 border border-gray-200 hover:bg-white/80' : 'bg-slate-800/70 backdrop-blur-md text-white border border-slate-700 hover:bg-slate-800/80'} flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl`}
                    >
                      <FaPhone className="text-2xl mb-2" style={{ color: '#2563EB' }} />
                      <span className="text-sm font-medium">{isArabic ? 'مكالمة' : 'Call'}</span>
                    </button>
                    <button
                      onClick={() => {
                        const digits = phoneEntries?.[0]?.digits || getPhoneDigits(lead?.phone || lead?.mobile || '', {
                          defaultCountryCode: getLeadDefaultCountryCode(effectiveLead),
                        })
                        if (digits) window.open(`https://wa.me/${digits}`, '_blank')
                      }}
                      className={`${isLight ? 'bg-white/70 backdrop-blur-md text-slate-800 border border-gray-200 hover:bg-white/80' : 'bg-slate-800/70 backdrop-blur-md text-white border border-slate-700 hover:bg-slate-800/80'} flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl`}
                    >
                      <FaWhatsapp className="text-2xl mb-2" style={{ color: '#25D366' }} />
                      <span className="text-sm font-medium">{isArabic ? 'واتساب' : 'WhatsApp'}</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => { if (lead?.email) window.open(`mailto:${lead.email}`, '_blank'); }}
                  className={`${isLight ? 'bg-white/70 backdrop-blur-md text-slate-800 border border-gray-200 hover:bg-white/80' : 'bg-slate-800/70 backdrop-blur-md text-white border border-slate-700 hover:bg-slate-800/80'} flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl`}
                >
                  <FaEnvelope className="text-2xl mb-2" style={{ color: '#FFA726' }} />
                  <span className="text-sm font-medium">{isArabic ? 'بريد إلكتروني' : 'Email'}</span>
                </button>
                <button
                  onClick={() => window.open('https://meet.google.com/new', '_blank')}
                  className={`${isLight ? 'bg-white/70 backdrop-blur-md text-slate-800 border border-gray-200 hover:bg-white/80' : 'bg-slate-800/70 backdrop-blur-md text-white border border-slate-700 hover:bg-slate-800/80'} flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl`}
                >
                  <img alt="Google Meet" className="w-6 h-6 mb-2" src={"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><rect x='2' y='4' width='12' height='16' rx='3' fill='%23ffffff'/><rect x='2' y='4' width='12' height='4' rx='2' fill='%234285F4'/><rect x='2' y='4' width='4' height='16' rx='2' fill='%2334A853'/><rect x='10' y='4' width='4' height='16' rx='2' fill='%23FBBC05'/><rect x='2' y='16' width='12' height='4' rx='2' fill='%23EA4335'/><polygon points='14,9 22,5 22,19 14,15' fill='%2334A853'/></svg>"} />
                  <span className="text-sm font-medium">{isArabic ? 'جوجل ميت' : 'Google Meet'}</span>
                </button>
              </div>
              )}

              {/* Filters */}
              <div className={`${isLight ? 'bg-white rounded-xl p-4 border border-gray-100 shadow-sm' : 'bg-slate-900/60 backdrop-blur-md rounded-xl p-4 border border-slate-700 shadow-sm'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${isLight ? 'text-gray-600' : 'text-white'}`}>{isArabic ? 'فلترة:' : 'Filter:'}</span>
                  <button onClick={() => setCommFilter('all')} className={`px-3 py-1 rounded-full text-xs transition-colors ${commFilter === 'all' ? (isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/30 text-white border border-blue-500') : (isLight ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-slate-800/60 text-white border border-slate-700 hover:bg-slate-800/80')}`}>
                    {isArabic ? 'الكل' : 'All'}
                  </button>
                  <button onClick={() => setCommFilter('whatsapp')} className={`px-3 py-1 rounded-full text-xs transition-colors ${commFilter === 'whatsapp' ? (isLight ? 'bg-green-100 text-green-700' : 'bg-green-500/30 text-white border border-green-500') : (isLight ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-slate-800/60 text-white border border-slate-700 hover:bg-slate-800/80')}`}>
                    {isArabic ? 'واتساب' : 'WhatsApp'}
                  </button>
                  <button onClick={() => setCommFilter('email')} className={`px-3 py-1 rounded-full text-xs transition-colors ${commFilter === 'email' ? (isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/30 text-white border border-blue-500') : (isLight ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-slate-800/60 text-white border border-slate-700 hover:bg-slate-800/80')}`}>
                    {isArabic ? 'بريد إلكتروني' : 'Email'}
                  </button>

                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {showWhatsAppSection && (
                <div className={`${isLight ? 'bg-white rounded-2xl p-6 border border-gray-100 shadow-sm' : 'bg-slate-900/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-sm'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className={`text-lg font-medium ${isLight ? 'text-black' : 'text-white'}`}>{isArabic ? 'سجل واتساب' : 'WhatsApp Chat'}</h4>
                    <div className="flex items-center gap-3">
                      <div className="text-sm">{waLoading ? (isArabic ? 'جاري التحميل...' : 'Loading...') : ''}</div>
                      <button
                        type="button"
                        onClick={refreshWhatsappChat}
                        disabled={waLoading || !lead?.id}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${waLoading || !lead?.id ? 'opacity-60 cursor-not-allowed' : ''} ${isLight ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'border-slate-700 text-white hover:bg-slate-800/80'}`}
                        title={isArabic ? 'تحديث الرسائل' : 'Refresh messages'}
                      >
                        <FaSyncAlt className={waLoading ? 'animate-spin' : ''} />
                        <span>{isArabic ? 'تحديث' : 'Refresh'}</span>
                      </button>
                    </div>
                  </div>
                  {waMirrorWarning && (
                    <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${isLight ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-500/40 bg-amber-500/10 text-amber-100'}`}>
                      {waMirrorWarning}
                    </div>
                  )}
                  <div ref={waMessagesContainerRef} className={`${waMessages.length > 3 ? 'max-h-64 overflow-y-auto pr-1' : ''} space-y-3`}>
                    {waMessages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`${m.direction === 'outbound' ? 'bg-green-500 text-white' : 'bg-white text-gray-800'} max-w-[75%] rounded-xl px-3 py-2 border ${m.direction === 'outbound' ? 'border-green-600' : 'border-gray-200'} shadow-sm`}>
                          {m.attribution && (
                            <div
                              className={`mb-1.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                m.direction === 'outbound'
                                  ? 'bg-white/20 text-white'
                                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              }`}
                              title={[m.attribution.campaign_name, m.attribution.ad_name, m.attribution.headline, m.attribution.source_id]
                                .filter(Boolean)
                                .join(' · ')}
                            >
                              <span>CTWA</span>
                              {(m.attribution.headline || m.attribution.campaign_name || m.attribution.source_id) && (
                                <span className="truncate opacity-90">
                                  {m.attribution.headline || m.attribution.campaign_name || m.attribution.source_id}
                                </span>
                              )}
                            </div>
                          )}
                          {renderWhatsappMessageMedia(m)}
                          {getWhatsappMessageText(m) ? (
                            <div className="text-sm break-words">{getWhatsappMessageText(m)}</div>
                          ) : null}
                          <div className="mt-1 text-[10px] opacity-70 flex items-center gap-2">
                            <span>{new Date(m.timestamp).toLocaleString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>{getWhatsappStatusLabel(m.status)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {waMessages.length === 0 && !waLoading && (
                      <div className={`${isLight ? 'text-gray-500' : 'text-white/70'} text-sm`}>{isArabic ? 'لا توجد رسائل' : 'No messages'}</div>
                    )}
                  </div>
                  <div className={`mt-3 rounded-[22px] border p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:mt-4 sm:rounded-[26px] sm:p-4 sm:shadow-[0_14px_40px_rgba(15,23,42,0.07)] ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-900/70'}`}>
                    {canAddAction ? (
                    <>
                    <div className={`mb-2 flex items-start justify-between gap-2 sm:mb-3 sm:gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
                      <div className={`flex min-w-0 items-start gap-2.5 sm:gap-3 ${isArabic ? 'flex-row-reverse text-right' : ''}`}>
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 sm:h-10 sm:w-10">
                          <FaWhatsapp className="text-[24px] sm:text-[28px]" />
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-lg font-semibold leading-tight sm:text-xl ${isLight ? 'text-slate-900' : 'text-white'}`}>{isArabic ? 'اكتب رسالة' : 'Type a message'}</div>
                          <div className={`mt-0.5 line-clamp-2 text-[11px] sm:text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{isArabic ? 'سيتم إرسال رسالتك إلى العميل' : 'Your message will be sent to the customer'}</div>
                        </div>
                      </div>
                      <div ref={whatsappTemplatePickerRef} className={`relative flex shrink-0 items-center gap-2 ${isArabic ? 'flex-row-reverse' : ''}`}>
                      
                      <div className={`hidden text-[11px] sm:block sm:text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{`${textBody.length} / 1000`}</div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!whatsappTemplatesSupported) {
                            showToast(
                              'error',
                              isArabic
                                ? 'القوالب متاحة فقط عند استخدام مزود واتساب Meta.'
                                : 'Templates are available only when the active WhatsApp provider is Meta.'
                            );
                            return;
                          }
                          setShowWhatsappTemplatePicker((prev) => !prev);
                        }}
                        disabled={!whatsappTemplatesSupported}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-medium shadow-sm transition-all sm:h-auto sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs ${isLight ? 'border-gray-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'} ${isArabic ? 'flex-row-reverse' : ''} ${!whatsappTemplatesSupported ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <FaFileAlt className="text-slate-500" />
                        <span>{isArabic ? 'القوالب' : 'Templates'}</span>
                        <FaChevronDown className={`text-xs opacity-70 transition-transform ${showWhatsappTemplatePicker ? 'rotate-180' : ''}`} />
                      </button>
                      {showWhatsappTemplatePicker && (
                        <div className={`absolute ${isArabic ? 'left-0' : 'right-0'} top-full z-20 mt-2 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border shadow-2xl ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
                          <div className={`border-b px-3 py-2.5 ${isLight ? 'border-gray-100 bg-slate-50/80' : 'border-slate-800 bg-slate-950/60'}`}>
                            <div className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{isArabic ? 'اختر قالب واتساب' : 'Choose a WhatsApp template'}</div>
                            <div className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{isArabic ? 'عند الاختيار سيتم إدراج النص تلقائياً في الرسالة.' : 'Choosing one will insert its text into the message.'}</div>
                          </div>
                          <div className="max-h-72 overflow-y-auto p-2">
                            {templates.length > 0 ? templates.map((template) => (
                              <button
                                key={template.id}
                                type="button"
                                onClick={() => applyWhatsappTemplateToComposer(template)}
                                className={`mb-1 flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition-all last:mb-0 ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800'} ${isArabic ? 'text-right' : ''}`}
                              >
                                <span className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{template.name}</span>
                                <span className={`mt-0.5 text-[11px] uppercase tracking-[0.18em] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{template.language || (isArabic ? 'قالب' : 'Template')}</span>
                                <span className={`mt-1 line-clamp-2 text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{template.body || (isArabic ? 'لا يوجد نص متاح' : 'No preview available')}</span>
                              </button>
                            )) : (
                              <div className={`px-3 py-4 text-sm ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
                                {tplLoading ? (isArabic ? 'جاري تحميل القوالب...' : 'Loading templates...') : (isArabic ? 'لا توجد قوالب متاحة' : 'No templates available')}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                    <input
                      ref={whatsappAttachmentInputRef}
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                      onChange={handleWhatsappAttachmentPick}
                      className="hidden"
                    />
                    <div className={`rounded-[20px] border-2 p-3 sm:rounded-[22px] sm:p-4 ${isLight ? 'border-emerald-500/90 bg-white' : 'border-emerald-500/70 bg-slate-950/40'}`}>
                    <textarea
                      ref={whatsappMessageInputRef}
                      rows="2"
                      maxLength={1000}
                      value={textBody}
                      onChange={(e) => setTextBody(e.target.value)}
                      placeholder={isArabic ? 'اكتب رسالتك...' : 'Type your message...'}
                      className={`min-h-[56px] max-h-[120px] w-full resize-none overflow-y-auto bg-transparent text-sm outline-none sm:min-h-[64px] sm:max-h-[160px] sm:text-base ${isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-400'}`}
                    />
                    <div className={`relative z-[2] mt-2 flex items-center justify-between gap-2 px-1 sm:mt-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
                      <div className={`flex items-center gap-1.5 ${isArabic ? 'flex-row-reverse' : ''}`}>
                        <div className="relative" ref={whatsappEmojiPickerRef}>
                          <button
                            type="button"
                            onClick={() => setShowWhatsappEmojiPicker((prev) => !prev)}
                            className={`inline-flex h-8 items-center gap-1 rounded-xl border px-2 text-[11px] font-medium transition-all sm:gap-1.5 sm:px-2.5 sm:text-xs ${isLight ? 'border-gray-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm' : 'border-slate-700 bg-slate-900/80 text-white hover:bg-slate-800'}`}
                          >
                            <span className="text-base">😊</span>
                            <span>{isArabic ? 'إيموجي' : 'Emoji'}</span>
                          </button>
                          {showWhatsappEmojiPicker && (
                            <div className={`absolute bottom-full mb-2 w-[280px] max-w-[calc(100vw-2.25rem)] overflow-hidden rounded-2xl border shadow-2xl ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
                              <div className={`border-b px-3 py-2.5 ${isLight ? 'border-gray-100 bg-slate-50/80' : 'border-slate-800 bg-slate-950/60'}`}>
                                <div className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{isArabic ? 'اختر إيموجي' : 'Pick an emoji'}</div>
                                <div className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{isArabic ? 'إيموجيز سريعة للردود والرسائل.' : 'Quick emojis for replies and messages.'}</div>
                              </div>
                              <div className="max-h-60 overflow-y-auto px-3 py-2.5">
                                <div className="space-y-3">
                                  {whatsappEmojiGroups.map((group) => (
                                    <div key={group.key}>
                                      <div className={`mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {group.label}
                                      </div>
                                      <div className="grid grid-cols-5 gap-1.5">
                                        {group.items.map((emoji) => (
                                          <button
                                            key={`${group.key}-${emoji}`}
                                            type="button"
                                            onClick={() => appendWhatsappEmoji(emoji)}
                                            className={`flex h-10 w-full items-center justify-center rounded-lg text-xl transition-all ${isLight ? 'bg-slate-50 hover:bg-blue-50 hover:shadow-sm' : 'bg-slate-800 hover:bg-slate-700'}`}
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleWhatsappAttachmentButtonClick}
                          disabled={!mediaAttachmentsSupported}
                          className={`inline-flex h-8 items-center gap-1 rounded-xl border px-2 text-[11px] font-medium transition-all sm:gap-1.5 sm:px-2.5 sm:text-xs ${isLight ? 'border-gray-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm' : 'border-slate-700 bg-slate-900/80 text-white hover:bg-slate-800'} ${!mediaAttachmentsSupported ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <FaPaperclip />
                          <span>{isArabic ? 'مرفق' : 'Attach'}</span>
                        </button>
                      </div>
                      <button
                        disabled={sendingText || (!textBody.trim() && !selectedWhatsappAttachment)}
                        onClick={handleSendWhatsappMessage}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-all sm:h-11 sm:px-5 sm:text-base ${sendingText ? 'opacity-60' : ''} ${isLight ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
                      >
                        <FaPaperPlane />
                        <span>{sendingText ? (isArabic ? 'جاري الإرسال...' : 'Sending...') : (isArabic ? 'إرسال' : 'Send')}</span>
                      </button>
                    </div>
                    </div>
                    {(!mediaAttachmentsSupported || !whatsappTemplatesSupported) && (
                      <div className={`mt-3 rounded-xl border px-3 py-2 text-xs sm:text-sm ${isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                        {isArabic
                          ? `بعض ميزات واتساب غير متاحة لأن المزود النشط هو ${whatsappProviderLabel} وليس Meta.`
                          : `Some WhatsApp features are unavailable because the active provider is ${whatsappProviderLabel}, not Meta.`}
                      </div>
                    )}
                    {selectedWhatsappAttachment && (
                      <div className={`mt-3 rounded-xl border p-3 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-slate-700 bg-slate-800/60'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${isLight ? 'text-slate-800' : 'text-white'}`}>
                              {selectedWhatsappAttachment.name}
                            </div>
                            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
                              {(selectedWhatsappAttachment.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={clearWhatsappAttachment}
                            className={`rounded-lg px-2 py-1 text-xs ${isLight ? 'bg-white text-slate-600 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
                          >
                            {isArabic ? 'إزالة' : 'Remove'}
                          </button>
                        </div>
                        {selectedWhatsappAttachment.type.startsWith('image/') && whatsappAttachmentPreviewUrl ? (
                          <img src={whatsappAttachmentPreviewUrl} alt={selectedWhatsappAttachment.name} className="mt-3 max-h-40 rounded-lg object-cover" />
                        ) : null}
                        {selectedWhatsappAttachment.type.startsWith('video/') && whatsappAttachmentPreviewUrl ? (
                          <video controls className="mt-3 max-h-40 rounded-lg bg-black">
                            <source src={whatsappAttachmentPreviewUrl} type={selectedWhatsappAttachment.type} />
                          </video>
                        ) : null}
                      </div>
                    )}
                    <div className={`mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 sm:mt-4 sm:py-3 ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/10 text-emerald-200'} ${isArabic ? 'flex-row-reverse' : ''}`}>
                      <FaCheckCircle className="shrink-0" />
                      <span className="text-xs font-medium sm:text-sm">
                        {isArabic ? 'رسائلك محمية بتشفير من طرف إلى طرف' : 'Your messages are end-to-end encrypted'}
                      </span>
                    </div>
                    <div className="hidden mt-2 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => whatsappAttachmentInputRef.current?.click()}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isLight ? 'border-gray-200 text-slate-700 hover:bg-gray-50' : 'border-slate-700 text-white hover:bg-slate-800/80'}`}
                      >
                        <FaPaperclip />
                        <span>{isArabic ? 'مرفق' : 'Attach'}</span>
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowWhatsappEmojiPicker((prev) => !prev)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isLight ? 'border-gray-200 text-slate-700 hover:bg-gray-50' : 'border-slate-700 text-white hover:bg-slate-800/80'}`}
                        >
                          <span className="text-base">😊</span>
                          <span>{isArabic ? 'إيموجي' : 'Emoji'}</span>
                        </button>
                        {showWhatsappEmojiPicker && (
                          <div className={`absolute bottom-full mb-2 flex max-w-[220px] flex-wrap gap-2 rounded-xl border p-3 shadow-xl ${isLight ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-900'}`}>
                            {whatsappEmojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => appendWhatsappEmoji(emoji)}
                                className="rounded-md px-2 py-1 text-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        disabled={sendingText || (!textBody.trim() && !selectedWhatsappAttachment)}
                        onClick={handleSendWhatsappMessage}
                        className={`px-4 py-2 rounded-lg ${sendingText ? 'opacity-60' : ''} ${isLight ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-emerald-500 text-white'}`}
                      >
                        {sendingText ? (isArabic ? 'جاري الإرسال...' : 'Sending...') : (isArabic ? 'إرسال' : 'Send')}
                      </button>
                    </div>
                    </>
                    ) : (
                      <div className="text-sm opacity-60 text-center py-4">{isArabic ? 'لا يمكنك إرسال رسائل لأنك لست المالك' : 'You cannot send messages because you are not the owner'}</div>
                    )}
                  </div>
                </div>
                )}
              </div>

              {/* Email Panel */}
              {showEmailSection && (
              <div className={`${isLight ? 'bg-white rounded-2xl p-6 border border-gray-100 shadow-sm' : 'bg-slate-900/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700 shadow-sm'} mt-6`}>
                <div className="flex justify-between items-center mb-4">
                  <h4 className={`text-lg font-medium ${isLight ? 'text-black' : 'text-white'}`}>{isArabic ? 'سجل البريد الإلكتروني' : 'Email Thread'}</h4>
                  <div className="text-sm">{emailLoading ? (isArabic ? 'جاري التحميل...' : 'Loading...') : ''}</div>
                </div>
                <div className="space-y-3">
                  {emailMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`${m.direction === 'outbound' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'} max-w-[75%] rounded-xl px-3 py-2 border ${m.direction === 'outbound' ? 'border-blue-600' : 'border-gray-200'} shadow-sm`}>
                        <div className="text-xs font-semibold opacity-80">{m.subject || (isArabic ? 'بدون عنوان' : 'No Subject')}</div>
                        <div className="text-sm whitespace-pre-wrap">{m.body || '-'}</div>
                        <div className="mt-1 text-[10px] opacity-70 flex items-center gap-2">
                          <span>{new Date(m.timestamp).toLocaleString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>{m.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {emailMessages.length === 0 && !emailLoading && (
                    <div className={`${isLight ? 'text-gray-500' : 'text-white/70'} text-sm`}>{isArabic ? 'لا توجد رسائل بريد' : 'No email messages'}</div>
                  )}
                </div>
                <div className="mt-6">
                  {canAddAction ? (
                  <>
                  <div className="flex items-center gap-2 mb-2">
                    <FaEnvelope className="text-orange-400" />
                    <span className={`text-sm ${isLight ? 'text-black' : 'text-white'}`}>{isArabic ? 'اكتب بريدًا' : 'Compose email'}</span>
                  </div>
                  <div className="mb-2">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        const tpl = emailTemplates.find(t => String(t.id) === String(id));
                        if (tpl) {
                          setEmailSubject((tpl.subject || '').trim());
                          setEmailBody((tpl.body || '').trim());
                        }
                        e.target.value = '';
                      }}
                      className={`w-full mb-2 px-3 py-2 border rounded-lg ${isLight ? 'border-gray-300' : 'bg-slate-800/70 text-white border-slate-700'}`}
                    >
                      <option value="">{isArabic ? 'اختر قالباً' : 'Choose a template'}</option>
                      {emailTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder={isArabic ? 'العنوان' : 'Subject'}
                    className={`w-full mb-2 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-300' : 'bg-slate-800/70 text-white border-slate-700 placeholder-slate-300'}`}
                  />
                  <textarea
                    rows="4"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder={isArabic ? 'محتوى البريد...' : 'Email body...'}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLight ? 'border-gray-300' : 'bg-slate-800/70 text-white border-slate-700 placeholder-slate-300'}`}
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim() || !lead?.email}
                      onClick={async () => {
                        if (sendingEmail) return;
                        setSendingEmail(true);
                        try {
                          const res = await sendEmailText({
                            lead_id: lead?.id,
                            recipient_email: lead?.email,
                            subject: emailSubject.trim(),
                            body: emailBody.trim(),
                          });
                          const ok = !!res?.ok;
                          setEmailMessages(prev => [...prev, {
                            subject: emailSubject.trim(),
                            body: emailBody.trim(),
                            direction: 'outbound',
                            timestamp: new Date().toISOString(),
                            status: ok ? 'sent' : 'failed',
                            id: Math.random().toString(36).slice(2),
                          }]);
                          setEmailSubject('');
                          setEmailBody('');
                        } catch { }
                        setSendingEmail(false);
                      }}
                      className={`px-4 py-2 rounded-lg ${sendingEmail ? 'opacity-60' : ''} ${isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white'}`}
                    >
                      {sendingEmail ? (isArabic ? 'جاري الإرسال...' : 'Sending...') : (isArabic ? 'إرسال' : 'Send')}
                    </button>
                  </div>
                  </>
                  ) : (
                    <div className="text-sm opacity-60 text-center py-4">{isArabic ? 'لا يمكنك إرسال بريد لأنك لست المالك' : 'You cannot send emails because you are not the owner'}</div>
                  )}
                </div>
              </div>
              )}

              {/* Compose Panel moved near Add Message button */}

              {/* Quick Analytics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                  <h5 className="font-medium text-green-800 mb-2">{isArabic ? 'أفضل قناة استجابة' : 'Best Response Channel'}</h5>
                  <p className="text-2xl font-bold text-green-600">{bestChannelLabel}</p>
                  <p className="text-sm text-green-600">{bestChannelRateLabel}</p>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                  <h5 className="font-medium text-blue-800 mb-2">{isArabic ? 'زمن الرد المتوسط' : 'Avg Response Time'}</h5>
                  <p className="text-2xl font-bold text-blue-600">{formatAverageResponseTime(communicationStats.averageResponseMinutes)}</p>
                  <p className="text-sm text-blue-600">
                    {communicationStats.averageResponseMinutes !== null
                      ? (isArabic ? 'محسوب من الردود الفعلية' : 'Based on actual replies')
                      : (isArabic ? 'بانتظار بيانات كافية' : 'Waiting for enough data')}
                  </p>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                  <h5 className="font-medium text-purple-800 mb-2">{isArabic ? 'نشاط هذا الأسبوع' : 'This Week Activity'}</h5>
                  <p className="text-2xl font-bold text-purple-600">{communicationStats.weeklyInteractions}</p>
                  <p className="text-sm text-purple-600">{isArabic ? 'تفاعل هذا الأسبوع' : 'Interactions this week'}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className={`${isLight ? 'text-black' : 'text-white'} font-semibold`}>
                  {isArabic ? 'المرفقات' : 'Attachments'} ({allAttachments.length})
                </h3>
              </div>

              {allAttachments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <FaFileAlt className="text-4xl mb-3 opacity-50" />
                  <p>{isArabic ? 'لا توجد مرفقات' : 'No attachments found'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {allAttachments.map((item, index) => {
                    const url = getFileUrl(item.path);
                    const name = getFileName(item.path);
                    const isImg = isImage(item.path);

                    return (
                      <div key={index} className={`group relative rounded-xl border overflow-hidden transition-all hover:shadow-md ${isLight ? 'bg-white border-gray-200' : 'bg-slate-700 border-slate-600'}`}>
                        <div className="aspect-square bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                          {isImg ? (
                            <img src={url} alt={name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          ) : (
                            <FaFileAlt className="text-4xl text-blue-400" />
                          )}
                          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                            {item.source}
                          </div>
                        </div>
                        <div className="p-3">
                          <p className={`text-sm font-medium truncate mb-1 ${isLight ? 'text-gray-700' : 'text-gray-200'}`} title={name}>{name}</p>
                          <p className="text-xs text-gray-500 mb-2">{item.date ? new Date(item.date).toLocaleDateString() : ''}</p>
                          <div className="flex items-center gap-2">
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg text-xs font-medium transition-colors"
                            >
                              <FaEye /> {isArabic ? 'عرض' : 'View'}
                            </a>
                            <a
                              href={url}
                              download
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg text-xs font-medium transition-colors"
                            >
                              <FaDownload /> {isArabic ? 'تحميل' : 'Download'}
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab !== 'overview' && activeTab !== 'all-actions' && activeTab !== 'communication' && activeTab !== 'attachments' && (
            <div className="text-center py-12">
              <p className="text-slate-400">Content for {activeTab} tab will be implemented here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Action Modal - inline بدل overlay */}
      {false && showAddActionModal && (
        <div className="mt-6">
          <AddActionModal
            isOpen={showAddActionModal}
            onClose={() => setShowAddActionModal(false)}
            onSave={handleAddAction}
            lead={lead}
            inline={true}
          />
        </div>
      )}

      <LeadConvertToCustomerModal
        isOpen={showConvertCustomerModal}
        lead={effectiveLead || lead}
        isArabic={isArabic}
        theme={theme}
        onClose={() => setShowConvertCustomerModal(false)}
        onConverted={handleRealEstateCustomerConverted}
      />

      {/* Re-Assign Lead Modal */}
      {!permissions?.is_referral_supervisor && (
        <ReAssignLeadModal
          isOpen={showReAssignModal}
          onClose={() => setShowReAssignModal(false)}
          lead={effectiveLead}
          onAssign={handleReAssign}
          isArabic={isArabic}
          currentUser={user}
        />
      )}

    </div>,
    document.body
  );
};

export default EnhancedLeadDetailsModal;
