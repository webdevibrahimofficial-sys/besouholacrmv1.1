import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchWebsiteContent } from '@/lib/cms';
import { defaultWebsiteContent, getSectionContent } from '@/lib/cmsDefaults';
import {
  careerBenefits,
  careerHighlights,
  careerValues,
  careersPageContent,
  openRoles,
} from '@/data/careers';

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

    const cmsCareerPage = content?.careers?.page?.content || {};
    const careerRoles =
      Array.isArray(content?.careers?.roles) && content.careers.roles.length > 0
        ? content.careers.roles.map((role) => ({
            ...role,
            workType: role.workType || role.work_type || '',
            employmentType: role.employmentType || role.employment_type || '',
            experienceLevel: role.experienceLevel || role.experience_level || '',
          }))
        : openRoles;

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
      careersPage: {
        badge: cmsCareerPage.badge || careersPageContent.badge,
        title: cmsCareerPage.title || careersPageContent.title,
        subtitle: cmsCareerPage.subtitle || careersPageContent.subtitle,
        primaryCta: cmsCareerPage.primary_cta || cmsCareerPage.primaryCta || careersPageContent.primaryCta,
        secondaryCta: cmsCareerPage.secondary_cta || cmsCareerPage.secondaryCta || careersPageContent.secondaryCta,
        rolesTitle: cmsCareerPage.roles_title || careersPageContent.rolesTitle,
        rolesHeading: cmsCareerPage.roles_heading || careersPageContent.rolesHeading,
        rolesSubtitle: cmsCareerPage.roles_subtitle || careersPageContent.rolesSubtitle,
        hiringBadge: cmsCareerPage.hiring_badge || careersPageContent.hiringBadge,
        availabilityNote: cmsCareerPage.availability_note || careersPageContent.availabilityNote,
        highlightsTitle: cmsCareerPage.highlights_title || careersPageContent.highlightsTitle,
        highlightsHeading: cmsCareerPage.highlights_heading || careersPageContent.highlightsHeading,
        valuesTitle: cmsCareerPage.values_title || careersPageContent.valuesTitle,
        valuesHeading: cmsCareerPage.values_heading || careersPageContent.valuesHeading,
        valuesSubtitle: cmsCareerPage.values_subtitle || careersPageContent.valuesSubtitle,
        benefitsTitle: cmsCareerPage.benefits_title || careersPageContent.benefitsTitle,
        benefitsHeading: cmsCareerPage.benefits_heading || careersPageContent.benefitsHeading,
        generalApplicationBadge:
          cmsCareerPage.general_application_badge || careersPageContent.generalApplicationBadge,
        generalApplicationHeading:
          cmsCareerPage.general_application_heading || careersPageContent.generalApplicationHeading,
        generalApplicationSubtitle:
          cmsCareerPage.general_application_subtitle || careersPageContent.generalApplicationSubtitle,
        generalApplicationButtonText:
          cmsCareerPage.general_application_button_text || careersPageContent.generalApplicationButtonText,
        generalFormHeadline:
          cmsCareerPage.general_form_headline || careersPageContent.generalFormHeadline,
        generalFormSubtitle:
          cmsCareerPage.general_form_subtitle || careersPageContent.generalFormSubtitle,
        sidebarBadge: cmsCareerPage.sidebar_badge || careersPageContent.sidebarBadge,
        roleFilters:
          Array.isArray(cmsCareerPage.role_filters) && cmsCareerPage.role_filters.length > 0
            ? cmsCareerPage.role_filters
            : careersPageContent.roleFilters,
        sidebarCards:
          Array.isArray(cmsCareerPage.sidebar_cards) && cmsCareerPage.sidebar_cards.length > 0
            ? cmsCareerPage.sidebar_cards
            : careersPageContent.sidebarCards,
      },
      careerHighlights:
        Array.isArray(cmsCareerPage.highlights) && cmsCareerPage.highlights.length > 0
          ? cmsCareerPage.highlights
          : careerHighlights,
      careerValues:
        Array.isArray(cmsCareerPage.values) && cmsCareerPage.values.length > 0
          ? cmsCareerPage.values
          : careerValues,
      careerBenefits:
        Array.isArray(cmsCareerPage.benefits) && cmsCareerPage.benefits.length > 0
          ? cmsCareerPage.benefits
          : careerBenefits,
      careerRoles,
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
