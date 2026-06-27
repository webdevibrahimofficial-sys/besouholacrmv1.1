import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircleMore } from 'lucide-react';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { trackWhatsappClick } from '@/lib/analytics';

const WhatsAppFloat = () => {
  const { settings } = useWebsiteContent();
  const [visible, setVisible] = useState(false);
  const floatSettings = settings?.whatsapp_float || {};
  const whatsappValue = settings?.whatsapp || '';

  const href = useMemo(() => {
    const digits = String(whatsappValue || '').replace(/[^\d]/g, '');
    if (!digits || floatSettings.enabled === false) {
      return '';
    }

    const message = encodeURIComponent(
      floatSettings.message || "Hi, I'd like to learn more about Be Souhola CRM."
    );

    return `https://wa.me/${digits}?text=${message}`;
  }, [floatSettings.enabled, floatSettings.message, whatsappValue]);

  useEffect(() => {
    if (!href) {
      return undefined;
    }

    const onScroll = () => {
      setVisible(window.scrollY > 300);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [href]);

  if (!href || !visible) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={floatSettings.tooltip || 'Chat with us'}
      title={floatSettings.tooltip || 'Chat with us'}
      onClick={trackWhatsappClick}
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-3 rounded-full border border-emerald-300/20 bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(16,185,129,0.35)] transition-transform duration-300 hover:scale-[1.02] hover:bg-emerald-400"
    >
      <MessageCircleMore className="h-5 w-5" />
      <span className="hidden sm:inline">{floatSettings.tooltip || 'Chat with us'}</span>
    </a>
  );
};

export default WhatsAppFloat;
