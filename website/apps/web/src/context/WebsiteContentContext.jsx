import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchWebsiteContent } from '@/lib/cms';
import { defaultWebsiteContent, getSectionContent } from '@/lib/cmsDefaults';

const WebsiteContentContext = createContext(null);

export const WebsiteContentProvider = ({ children }) => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchWebsiteContent().then((data) => {
      if (mounted) {
        setContent(data);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => {
    const sections = content?.sections || [];
    const hero = getSectionContent(sections, 'hero', defaultWebsiteContent.sections.hero);
    const settings = {
      ...defaultWebsiteContent.settings,
      ...(content?.settings || {}),
    };
    const services =
      content?.services?.length > 0 ? content.services : defaultWebsiteContent.services;
    const hasCmsItemPayload = content?.fromCms === true && Array.isArray(content?.items);
    const leadServiceOptions =
      hasCmsItemPayload
        ? content.items
            .map((item) => {
              const label = item?.name?.trim();
              if (!label) return null;

              return {
                value: String(item.id),
                label,
                itemId: item.id,
                code: item.code || null,
              };
            })
            .filter(Boolean)
        : hero.service_options;

    return {
      loading,
      fromCms: content?.fromCms === true,
      settings,
      services,
      hero,
      servicesIntro: getSectionContent(
        sections,
        'services_intro',
        defaultWebsiteContent.sections.services_intro
      ),
      cta: getSectionContent(sections, 'cta', defaultWebsiteContent.sections.cta),
      leadServiceOptions,
    };
  }, [content, loading]);

  return (
    <WebsiteContentContext.Provider value={value}>
      {children}
    </WebsiteContentContext.Provider>
  );
};

export const useWebsiteContent = () => {
  const context = useContext(WebsiteContentContext);
  if (!context) {
    throw new Error('useWebsiteContent must be used within WebsiteContentProvider');
  }
  return context;
};
