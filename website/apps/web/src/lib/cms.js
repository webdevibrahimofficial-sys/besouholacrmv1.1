import { defaultWebsiteContent } from '@/lib/cmsDefaults';
import {
  careerBenefits,
  careerHighlights,
  careerValues,
  careersPageContent,
  openRoles,
} from '@/data/careers';

const getApiBase = () => {
  const raw = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    'http://127.0.0.1:8000'
  ).trim();

  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
};

const getTenantSlug = () =>
  import.meta.env.VITE_TENANT_SLUG?.trim() || 'besouhola';

export const fetchWebsiteContent = async () => {
  const tenantSlug = getTenantSlug();
  const endpoint = `${getApiBase()}/api/public/website/${tenantSlug}`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`CMS request failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      fromCms: true,
    };
  } catch (error) {
    console.warn('Falling back to static website content:', error.message);
    return {
      fromCms: false,
      settings: defaultWebsiteContent.settings,
      sections: Object.entries(defaultWebsiteContent.sections).map(([type, content]) => ({
        type,
        content,
      })),
      services: defaultWebsiteContent.services,
      items: [],
      careers: {
        page: {
          content: {
            badge: careersPageContent.badge,
            title: careersPageContent.title,
            subtitle: careersPageContent.subtitle,
            primary_cta: careersPageContent.primaryCta,
            secondary_cta: careersPageContent.secondaryCta,
            roles_title: careersPageContent.rolesTitle,
            roles_heading: careersPageContent.rolesHeading,
            roles_subtitle: careersPageContent.rolesSubtitle,
            hiring_badge: careersPageContent.hiringBadge,
            availability_note: careersPageContent.availabilityNote,
            highlights_title: careersPageContent.highlightsTitle,
            highlights_heading: careersPageContent.highlightsHeading,
            values_title: careersPageContent.valuesTitle,
            values_heading: careersPageContent.valuesHeading,
            values_subtitle: careersPageContent.valuesSubtitle,
            benefits_title: careersPageContent.benefitsTitle,
            benefits_heading: careersPageContent.benefitsHeading,
            general_application_badge: careersPageContent.generalApplicationBadge,
            general_application_heading: careersPageContent.generalApplicationHeading,
            general_application_subtitle: careersPageContent.generalApplicationSubtitle,
            general_application_button_text: careersPageContent.generalApplicationButtonText,
            general_form_headline: careersPageContent.generalFormHeadline,
            general_form_subtitle: careersPageContent.generalFormSubtitle,
            sidebar_badge: careersPageContent.sidebarBadge,
            sidebar_cards: careersPageContent.sidebarCards,
            role_filters: careersPageContent.roleFilters,
            highlights: careerHighlights,
            values: careerValues,
            benefits: careerBenefits,
          },
        },
        roles: openRoles,
      },
    };
  }
};
