export const defaultWebsiteContent = {
  settings: {
    company_name: 'Be Souhola',
    logo_url:
      'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/49e5fc512fe9f5468e81f2135e55bdb4.png',
    phone: '+1 (555) 234-5678',
    email: 'sales@besouhola.com',
    whatsapp: null,
    address: '200 Tech Boulevard, Suite 400, Innovation City, CA 94102',
    social_links: {
      facebook: 'https://www.facebook.com/profile.php?id=61587661674565',
    },
    primary_color: '#9372FF',
    seo_title: 'Be Souhola - CRM Platform for Real Estate & Business',
    seo_description:
      'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.',
  },
  sections: {
    hero: {
      badge: 'AI-Powered CRM Platform',
      headline: 'One Intelligent CRM Built for Your Growth',
      headline_accent: '',
      subtitle:
        'Be Souhola adapts to your workflow. Capture leads, automate follow-ups, and close deals faster whether you are a growing business or a specialized real estate team.',
      primary_cta: 'Request Demo',
      secondary_cta: 'Explore Features',
      form_title: 'Book Your Free Demo',
      form_subtitle: 'Tell us what you need and our team will contact you within 24 hours.',
      form_badge: 'CRM Demo',
      form_side_title: 'Why Teams Choose Us',
      form_button_text: 'Request Demo',
      name_label: 'Full name *',
      name_placeholder: 'John Doe',
      phone_label: 'Phone number *',
      phone_placeholder: '+20 100 000 0000',
      email_label: 'Email address',
      email_placeholder: 'you@company.com',
      service_label: 'Service interested in',
      service_placeholder: 'Select your business type',
      message_label: 'Notes',
      message_placeholder: 'Anything we should know before we contact you?',
      privacy_note: 'Your data stays private and is only used to contact you.',
      success_title: 'Thank you!',
      success_message: 'We received your request. Our team will contact you shortly.',
      success_reset_text: 'Submit another request',
      trust_points: [
        '500+ businesses',
        'AI-powered automation',
        'Enterprise-grade security',
      ],
      benefit_points: [
        'Free consultation',
        'Response within 24 hours',
        'No commitment required',
      ],
      form_panel_points: [
        'Setup support included',
        'Tailored walkthrough',
        'Clear next steps',
      ],
      service_options: [
        'General Business CRM (Sales & Marketing)',
        'Real Estate CRM (Property & Lead Management)',
        'Other',
      ],
      stats: [
        { value: '500+', label: 'Teams onboarded' },
        { value: '24h', label: 'Average first response' },
        { value: '38%', label: 'Faster deal closing' },
      ],
    },
    services_intro: {
      title: 'PLATFORM',
      title_accent: 'FEATURES',
      description:
        'Be Souhola is a software company specializing in developing advanced Customer Relationship Management (CRM) solutions designed to support business growth and enhance operational efficiency.',
      tags: ['CRM', 'Real Estate', 'AI Automation', 'Analytics'],
    },
    cta: {
      headline: 'Ready to Transform Your',
      headline_accent: 'Business',
      subtitle:
        'Join hundreds of businesses already using Be Souhola to streamline operations, boost sales, and build stronger client relationships.',
      highlights: [
        'Boost conversion rates by up to 38%',
        'Go live in days, not months',
        'Dedicated onboarding support',
      ],
    },
  },
  services: [
    {
      name: 'Client Relationship Management',
      short_description:
        'Centralize all client interactions, projects, and sales pipelines in one intelligent platform.',
      description:
        'Centralize all client interactions, projects, and sales pipelines in one intelligent platform. Track every touchpoint, automate follow-ups, and never miss an opportunity to close deals.',
    },
    {
      name: 'Real-time Analytics & Reporting',
      short_description:
        'Make data-driven decisions with comprehensive dashboards and real-time insights.',
      description:
        'Make data-driven decisions with comprehensive dashboards and real-time insights. Monitor sales performance, track KPIs, and identify trends before your competition does.',
    },
    {
      name: 'AI-Powered Automation',
      short_description:
        'Leverage intelligent automation and predictive insights to streamline workflows.',
      description:
        'Leverage intelligent automation and predictive insights to streamline workflows. Let AI handle routine tasks while your team focuses on building relationships and closing deals.',
    },
    {
      name: 'Customizable Platform',
      short_description: 'Adaptable to multiple industries with a strong focus on real estate.',
      description:
        'Adaptable to multiple industries with a strong focus on real estate. Configure workflows, fields, and processes to match your unique business requirements without writing code.',
    },
    {
      name: 'Team Collaboration',
      short_description:
        'Align teams and streamline operations with shared workspaces and task management.',
      description:
        'Align teams and streamline operations with shared workspaces, task management, and real-time communication. Keep everyone on the same page from sales to customer success.',
    },
    {
      name: 'Mobile-First Design',
      short_description: 'Access your CRM anywhere, anytime with our responsive mobile platform.',
      description:
        'Access your CRM anywhere, anytime with our responsive mobile platform. Manage clients, update deals, and stay productive whether you are in the office or on the go.',
    },
  ],
};

export const getSectionContent = (sections, type, fallback = {}) => {
  const fromApi = sections?.find((section) => section.type === type)?.content;
  return { ...fallback, ...(fromApi || {}) };
};
