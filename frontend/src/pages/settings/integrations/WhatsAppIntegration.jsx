import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plug, FileText, MessageCircle } from 'lucide-react';
import WhatsAppConnection from '../../../components/integrations/WhatsAppConnection';
import WhatsAppTemplates from '../../../components/integrations/WhatsAppTemplates';
import WhatsAppMirrorConnection from '../../../components/integrations/WhatsAppMirrorConnection';
import WhatsAppMirrorInbox from '../../../components/integrations/WhatsAppMirrorInbox';
import { whatsappMirrorService } from '../../../services/whatsappService';
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '@shared/context/AppStateProvider'

const canViewMirrorInbox = (user) => {
  const roles = [
    user?.role,
    user?.job_title,
    ...(Array.isArray(user?.roles) ? user.roles.map((role) => role?.name || role) : []),
  ]
    .filter(Boolean)
    .map((role) => String(role).trim().toLowerCase())

  return Boolean(user?.is_super_admin)
    || roles.some((role) => (
      ['admin', 'tenant admin', 'tenant-admin', 'owner', 'director'].includes(role)
      || role.includes('director')
      || role.includes('operation')
    ))
}

const WhatsAppIntegration = () => {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { user } = useAppState()
  const { t } = useTranslation();
  const showMirrorInbox = useMemo(() => canViewMirrorInbox(user), [user])
  const [activeTab, setActiveTab] = useState('connection'); // connection | templates | unassigned | inbox
  const [pendingContactsCount, setPendingContactsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchPendingCount = async () => {
      try {
        const data = await whatsappMirrorService.getUnassignedContacts({ status: 'pending', per_page: 1 });
        if (!cancelled) {
          setPendingContactsCount(data?.total || 0);
        }
      } catch {
        if (!cancelled) setPendingContactsCount(0);
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'inbox' && !showMirrorInbox) {
      setActiveTab('connection')
    }
  }, [activeTab, showMirrorInbox]);

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <h1 className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{t('WhatsApp Integration')}</h1>
        <p className={`${isLight ? 'text-black' : 'text-white'} opacity-60`}>
          {t('Manage your WhatsApp Business API connection and message templates')}
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('connection')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
            activeTab === 'connection'
              ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Plug className="w-4 h-4" />
          {t('Connection')}
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
            activeTab === 'templates'
              ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          {t('Templates')}
        </button>
        <button
          onClick={() => setActiveTab('unassigned')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all relative ${
            activeTab === 'unassigned'
              ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Unassigned
          {pendingContactsCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {pendingContactsCount > 99 ? '99+' : pendingContactsCount}
            </span>
          )}
        </button>
        {showMirrorInbox && (
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
              activeTab === 'inbox'
                ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            {t('Conversations')}
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        {activeTab === 'connection' && (
          <WhatsAppConnection
            extraConnectionSection={<WhatsAppMirrorConnection mode="connection" embedded />}
          />
        )}
        {activeTab === 'templates' && <WhatsAppTemplates />}
        {activeTab === 'unassigned' && <WhatsAppMirrorConnection mode="directory" />}
        {activeTab === 'inbox' && showMirrorInbox && <WhatsAppMirrorInbox />}
      </div>
    </div>
  );
};

export default WhatsAppIntegration;
