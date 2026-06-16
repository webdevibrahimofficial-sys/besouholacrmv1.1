import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { systemCompanyWebsiteService } from '../services/systemCompanyWebsiteService'
import WebsiteAnalyticsPanel from '../components/website/WebsiteAnalyticsPanel'
import WebsiteCareersPanel, { emptyRole as emptyCareerRole } from '../components/website/WebsiteCareersPanel'

const defaultHeroSectionContent = {
  badge: 'AI-Powered CRM Platform',
  headline: 'One Intelligent CRM Built for Your Growth',
  headline_accent: '',
  subtitle:
    'Be Souhola adapts to your workflow. Capture leads, automate follow-ups, and close deals faster whether you are a growing business or a specialized real estate team.',
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
  benefit_points: ['Free consultation', 'Response within 24 hours', 'No commitment required'],
  form_panel_points: ['Setup support included', 'Tailored walkthrough', 'Clear next steps'],
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
}

const defaultTrustedClientsSectionContent = {
  eyebrow: 'Trusted by industry leaders',
  highlight_text: '50+ industries/businesses',
  headline_suffix: 'trust Be Souhola',
  clients: [
    'Meridian Properties',
    'Skyline Realty Group',
    'Urban Development Partners',
    'Coastal Estates',
    'PropTech Innovations',
    'Thompson & Associates',
  ],
}
const defaultAboutSectionContent = {
  primary_enabled: true,
  primary_image_url:
    'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/charlesdeluvio-lks7vei-eag-unsplash-7Or6F.jpg',
  primary_image_alt: 'Modern office with technology team collaborating on CRM development',
  primary_title: "We're passionate about",
  primary_title_accent: 'business transformation',
  primary_card_one_title: 'CRM platform powered by artificial intelligence',
  primary_card_one_body:
    'This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision.',
  primary_card_two_title: 'Focus on measurable impact',
  primary_card_two_body:
    'Our mission is to empower companies to build a smart business ecosystem that connects sales teams, customer service, and management within one flexible and customizable platform. We aim to enhance customer experience, improve operational efficiency, and support decision-making through real-time analytics and intelligent AI-driven tools, ensuring sustainable growth and long-term competitive advantage.',
  secondary_enabled: true,
  secondary_image_url:
    'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/whatsapp-image-2026-02-16-at-9.34.48-pm-1-crJEf.jpeg',
  secondary_image_alt: 'Diverse team collaborating on CRM strategy and implementation',
  secondary_title: 'Your success, our',
  secondary_title_accent: 'technology',
  secondary_card_one_title: 'Our vision for the future',
  secondary_card_one_body:
    'Our vision is to become the leading technology partner for companies in the real estate sector and other industries by providing an integrated CRM platform powered by artificial intelligence. This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision.',
  secondary_card_two_title: 'Built for scalability and growth',
  secondary_card_two_body:
    'This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision. From startups to enterprise organizations, Be Souhola scales with your business.',
}
const defaultPortfolioSectionContent = {
  eyebrow: 'Industry Solutions',
  title: 'Real results across',
  title_accent: 'multiple industries',
  description:
    'Discover how Be Souhola empowers businesses across real estate, property management, and professional services to achieve measurable growth and operational excellence.',
  cards: [
    {
      slug: 'real-estate-pipeline',
      title: 'Real Estate Sales Pipeline',
      metric: 'Increased sales by 47%',
      description:
        'Complete sales pipeline management for real estate firms with automated lead tracking and deal progression.',
      image_url:
        'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/tech-daily-lkyv7faumza-unsplash-2-FOBCl.jpg',
      image_alt:
        'Real estate CRM dashboard showing sales pipeline and property listings on a laptop',
    },
    {
      slug: 'property-management',
      title: 'Property Management Operations',
      metric: 'Manages 850+ properties',
      description:
        'Streamlined property management operations with tenant tracking, maintenance scheduling, and financial reporting.',
      image_url:
        'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/gemini_generated_image_n6u5epn6u5epn6u5-5abrf-2-W2Hon.jpg',
      image_alt:
        'Property management dashboard displaying tenant information and maintenance schedules on a tablet',
    },
    {
      slug: 'multi-industry-tracking',
      title: 'Multi-Industry Client Tracking',
      metric: 'Reduced admin time by 62%',
      description:
        'Customizable client relationship management adapted for healthcare, consulting, and professional services sectors.',
      image_url:
        'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/sumup-vsyr_mbh7q4-unsplash-2-Hxitr.jpg',
      image_alt:
        'Business analytics dashboard showing client tracking metrics and performance data on a smartphone',
    },
  ],
}
const defaultTestimonialsSectionContent = {
  title: 'Businesses that',
  title_accent: 'transformed',
  title_suffix: 'with Be Souhola',
  testimonials: [
    {
      name: 'Marcus Rivera',
      role: 'VP of Sales, Meridian Properties',
      content:
        'Be Souhola transformed how we manage client relationships and increased our sales pipeline visibility by 53%. The real-time analytics help us identify opportunities we were missing before.',
      avatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    {
      name: 'Priya Sharma',
      role: 'Operations Director, Skyline Realty Group',
      content:
        'The customizable workflows saved our team 12 hours every week. We can finally focus on building relationships instead of drowning in spreadsheets and manual data entry.',
      avatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    {
      name: 'James Chen',
      role: 'CEO, Urban Development Partners',
      content:
        'We manage over 600 properties across three cities, and Be Souhola keeps everything organized in one place. The AI-powered insights have helped us make faster, data-driven decisions.',
      avatar:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    {
      name: 'Sofia Martinez',
      role: 'Sales Manager, Coastal Estates',
      content:
        'Our conversion rate increased by 38% within the first quarter. The automated follow-ups ensure we never miss a lead, and the mobile app keeps us productive on the go.',
      avatar:
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    {
      name: 'David Thompson',
      role: 'Managing Partner, Thompson & Associates',
      content:
        'Be Souhola adapted perfectly to our consulting firm. The platform is flexible enough to handle our unique workflows while powerful enough to scale as we grow.',
      avatar:
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
    {
      name: 'Aisha Okonkwo',
      role: 'Head of Customer Success, PropTech Innovations',
      content:
        'The real-time collaboration features keep our entire team aligned. We reduced our sales cycle by 22% and improved customer satisfaction scores across the board.',
      avatar:
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    },
  ],
}

const defaultLeadLeakDetectorSectionContent = {
  eyebrow: 'Free sales audit',
  title: 'Are leads slipping through your pipeline?',
  subtitle:
    'Answer 7 quick questions and uncover the top three sales leaks holding your team back in under 60 seconds.',
  items: [
    'First-response speed',
    'Lead leakage points',
    'Follow-up consistency',
  ],
  button_text: 'Start the audit',
  floating_button_text: 'Test your pipeline',
  app_eyebrow: 'Mobile app',
  app_headline: 'Manage leads, teams, and projects from anywhere',
  app_description:
    'Give your sales team a fast mobile workspace to follow up leads, manage tasks, and stay updated in the field.',
  app_image_url: '',
  app_highlights: [
    'Lead follow-up',
    'Team tasks',
    'Real estate inventory',
    'Instant reminders',
  ],
  app_title: 'Be Souhola Mobile App',
  app_subtitle:
    'A polished mobile workspace for sales teams, projects, and daily follow-up.',
  app_items: [
    'Leads',
    'Tasks',
    'Projects',
    'Reports',
  ],
  app_button_text: 'See the mobile app in action',
  app_availability_text: 'Mobile app available for your sales team',
  integration_eyebrow: 'Live integrations',
  integration_headline: 'Plug every lead source into one CRM flow',
  integration_description:
    'Show that Meta, website forms, chat, ads, WhatsApp, and notifications all land inside one connected operating layer for your sales team.',
  integration_highlights: [
    'Unified lead intake',
    'Live source visibility',
    'Faster follow-up handoff',
  ],
  integration_title: 'Live Integration Badge',
  integration_subtitle:
    'Show that every lead source, chat, and notification flow can live inside one connected CRM engine.',
  integration_items: [
    'Meta Leads',
    'Website Forms',
    'Website Chat',
    'Google Ads',
    'WhatsApp',
    'Email Notifications',
  ],
  integration_button_text: 'See the audit in action',
  result_cta_text: 'Book a result-based demo',
}

const emptyService = {
  name: '',
  short_description: '',
  description: '',
  cta_text: 'Request a Demo',
  form_name: '',
  is_active: true,
}

const websiteTabs = ['settings', 'homepage', 'services', 'careers', 'analytics']
const websiteTabLabels = {
  settings: 'Settings',
  homepage: 'Homepage',
  services: 'Services',
  careers: 'Careers',
  analytics: 'Analytics',
}
const defaultContactPageContent = {
  headline: "Let's",
  headline_accent: 'connect',
  description: 'Schedule a demo, get support, or learn how Be Souhola can transform your business operations.',
  sales_label: 'Sales & Demos',
  phone_label: 'Phone',
  whatsapp_label: 'WhatsApp',
  address_label: 'Our Office',
  website_label: 'Website',
  website_text: 'besouhola.com',
  website_url: 'https://besouhola.com',
  social_label: 'Facebook',
  form_title: 'Request a demo',
  form_subtitle: 'Complete the form below and our team will get back to you shortly.',
}
const homepageSubTabs = ['hero', 'trusted_clients', 'about', 'portfolio', 'testimonials', 'more_sections']
const homepageSubTabLabels = {
  hero: 'Hero',
  trusted_clients: 'Trusted Clients',
  about: 'About',
  portfolio: 'Portfolio',
  testimonials: 'Testimonials',
  more_sections: 'More Sections',
}
const carouselSettingsTabs = ['app_slide', 'audit_slide', 'integration_slide', 'result_cta']
const carouselSettingsTabLabels = {
  app_slide: 'App Slide',
  audit_slide: 'Audit Slide',
  integration_slide: 'Integration Slide',
  result_cta: 'Result & CTA',
}

const normalizeWebsiteSettingsObject = (value, fallback = {}) => {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch {
      return fallback
    }
  }

  return fallback
}

const normalizeWebsiteSettings = (value) => {
  const base = value && typeof value === 'object' ? { ...value } : {}

  return {
    ...base,
    social_links: normalizeWebsiteSettingsObject(base.social_links, {}),
    contact_page_content: normalizeWebsiteSettingsObject(base.contact_page_content, {}),
  }
}

export default function WebsiteCms() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab = websiteTabs.includes(requestedTab) ? requestedTab : 'settings'
  const activeTabLabel = websiteTabLabels[activeTab] || 'Settings'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(null)
  const [sections, setSections] = useState([])
  const [services, setServices] = useState([])
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [careerPage, setCareerPage] = useState(null)
  const [careerRoles, setCareerRoles] = useState([])
  const [careerApplications, setCareerApplications] = useState([])
  const [careerRoleForm, setCareerRoleForm] = useState(emptyCareerRole)
  const [editingCareerRoleId, setEditingCareerRoleId] = useState(null)
  const [homepageSubTab, setHomepageSubTab] = useState('hero')
  const [carouselSettingsTab, setCarouselSettingsTab] = useState('app_slide')
  const [leadLeakDetectorFiles, setLeadLeakDetectorFiles] = useState({
    app_image: null,
  })
  const [brandingFiles, setBrandingFiles] = useState({
    logo: null,
  })
  const [aboutImageFiles, setAboutImageFiles] = useState({
    primary_image: null,
    secondary_image: null,
  })
  const [portfolioImageFiles, setPortfolioImageFiles] = useState({
    0: null,
    1: null,
    2: null,
  })
  const [testimonialImageFiles, setTestimonialImageFiles] = useState({
    0: null,
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
  })
  const [aboutPanels, setAboutPanels] = useState({
    primary: true,
    secondary: false,
  })

  useEffect(() => {
    if (!websiteTabs.includes(requestedTab)) {
      setSearchParams({ tab: 'settings' }, { replace: true })
    }
  }, [requestedTab, setSearchParams])

  const heroSection = useMemo(
    () => sections.find((section) => section.type === 'hero'),
    [sections]
  )
  const servicesIntroSection = useMemo(
    () => sections.find((section) => section.type === 'services_intro'),
    [sections]
  )
  const trustedClientsSection = useMemo(
    () => sections.find((section) => section.type === 'trusted_clients'),
    [sections]
  )
  const aboutSection = useMemo(
    () => sections.find((section) => section.type === 'about'),
    [sections]
  )
  const portfolioSection = useMemo(
    () => sections.find((section) => section.type === 'portfolio'),
    [sections]
  )
  const testimonialsSection = useMemo(
    () => sections.find((section) => section.type === 'testimonials'),
    [sections]
  )
  const leadLeakDetectorSection = useMemo(
    () =>
      sections.find((section) => section.type === 'lead_leak_detector') ||
      sections.find((section) => section.type === 'integration_badge'),
    [sections]
  )
  const ctaSection = useMemo(
    () => sections.find((section) => section.type === 'cta'),
    [sections]
  )
  const heroContent = useMemo(() => {
    if (!heroSection) return defaultHeroSectionContent
    return {
      ...defaultHeroSectionContent,
      ...(heroSection.content || {}),
      benefit_points: Array.isArray(heroSection.content?.benefit_points)
        ? heroSection.content.benefit_points
        : defaultHeroSectionContent.benefit_points,
      form_panel_points: Array.isArray(heroSection.content?.form_panel_points)
        ? heroSection.content.form_panel_points
        : defaultHeroSectionContent.form_panel_points,
      service_options: Array.isArray(heroSection.content?.service_options)
        ? heroSection.content.service_options
        : defaultHeroSectionContent.service_options,
      stats: Array.isArray(heroSection.content?.stats)
        ? heroSection.content.stats
        : defaultHeroSectionContent.stats,
    }
  }, [heroSection])
  const trustedClientsContent = useMemo(() => {
    if (!trustedClientsSection) return defaultTrustedClientsSectionContent
    return {
      ...defaultTrustedClientsSectionContent,
      ...(trustedClientsSection.content || {}),
      clients: Array.isArray(trustedClientsSection.content?.clients)
        ? trustedClientsSection.content.clients
        : defaultTrustedClientsSectionContent.clients,
    }
  }, [trustedClientsSection])
  const contactPageContent = useMemo(
    () => ({
      ...defaultContactPageContent,
      ...(settings?.contact_page_content || {}),
    }),
    [settings]
  )
  const aboutContent = useMemo(() => {
    if (!aboutSection) return defaultAboutSectionContent
    return {
      ...defaultAboutSectionContent,
      ...(aboutSection.content || {}),
    }
  }, [aboutSection])
  const portfolioContent = useMemo(() => {
    if (!portfolioSection) return defaultPortfolioSectionContent
    return {
      ...defaultPortfolioSectionContent,
      ...(portfolioSection.content || {}),
      cards: Array.isArray(portfolioSection.content?.cards) && portfolioSection.content.cards.length > 0
        ? portfolioSection.content.cards.map((card, index) => ({
            ...(defaultPortfolioSectionContent.cards[index] || {}),
            ...(card || {}),
          }))
        : defaultPortfolioSectionContent.cards,
    }
  }, [portfolioSection])
  const testimonialsContent = useMemo(() => {
    if (!testimonialsSection) return defaultTestimonialsSectionContent
    return {
      ...defaultTestimonialsSectionContent,
      ...(testimonialsSection.content || {}),
      testimonials:
        Array.isArray(testimonialsSection.content?.testimonials) &&
        testimonialsSection.content.testimonials.length > 0
          ? testimonialsSection.content.testimonials.map((item, index) => ({
              ...(defaultTestimonialsSectionContent.testimonials[index] || {}),
              ...(item || {}),
            }))
          : defaultTestimonialsSectionContent.testimonials,
    }
  }, [testimonialsSection])
  const leadLeakDetectorContent = useMemo(() => {
    if (!leadLeakDetectorSection) return defaultLeadLeakDetectorSectionContent
    return {
      ...defaultLeadLeakDetectorSectionContent,
      ...(leadLeakDetectorSection.content || {}),
      items:
        Array.isArray(leadLeakDetectorSection.content?.items) &&
        leadLeakDetectorSection.content.items.length > 0
          ? leadLeakDetectorSection.content.items
          : defaultLeadLeakDetectorSectionContent.items,
    }
  }, [leadLeakDetectorSection])

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [settingsData, sectionsData, servicesData, careerPageData, careerRolesData, careerApplicationsData] = await Promise.all([
        systemCompanyWebsiteService.getSettings(),
        systemCompanyWebsiteService.getHomepageSections(),
        systemCompanyWebsiteService.getServices(),
        systemCompanyWebsiteService.getCareerPage(),
        systemCompanyWebsiteService.getCareerRoles(),
        systemCompanyWebsiteService.getCareerApplications(),
      ])
      setSettings(normalizeWebsiteSettings(settingsData))
      setSections(sectionsData)
      setServices(servicesData)
      setCareerPage(careerPageData)
      setCareerRoles(careerRolesData)
      setCareerApplications(careerApplicationsData)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load website CMS.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const updateSectionContent = (sectionId, nextContent) => {
    setSections((prev) =>
      prev.map((item) =>
        item.id === sectionId ? { ...item, content: nextContent } : item
      )
    )
  }

  const updateHeroField = (key, value) => {
    if (!heroSection) return
    updateSectionContent(heroSection.id, {
      ...heroContent,
      [key]: value,
    })
  }

  const updateHeroList = (key, text) => {
    updateHeroField(
      key,
      text
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }

  const updateHeroStats = (text) => {
    const stats = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [value, ...labelParts] = line.split('|')
        return {
          value: value?.trim() || '',
          label: labelParts.join('|').trim(),
        }
      })
      .filter((item) => item.value || item.label)

    updateHeroField('stats', stats)
  }

  const updateTrustedClientsField = (key, value) => {
    if (!trustedClientsSection) return
    updateSectionContent(trustedClientsSection.id, {
      ...trustedClientsContent,
      [key]: value,
    })
  }

  const updateTrustedClientsList = (text) => {
    updateTrustedClientsField(
      'clients',
      text
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }

  const updateAboutField = (key, value) => {
    if (!aboutSection) return
    updateSectionContent(aboutSection.id, {
      ...aboutContent,
      [key]: value,
    })
  }

  const toggleAboutPanel = (panel) => {
    setAboutPanels((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }))
  }

  const updatePortfolioField = (key, value) => {
    if (!portfolioSection) return
    updateSectionContent(portfolioSection.id, {
      ...portfolioContent,
      [key]: value,
    })
  }

  const updatePortfolioCardField = (index, key, value) => {
    if (!portfolioSection) return
    const cards = Array.isArray(portfolioContent.cards) ? [...portfolioContent.cards] : []
    cards[index] = {
      ...(cards[index] || {}),
      [key]: value,
    }
    updateSectionContent(portfolioSection.id, {
      ...portfolioContent,
      cards,
    })
  }

  const updateServicesIntroField = (key, value) => {
    if (!servicesIntroSection) return
    setSections((prev) =>
      prev.map((item) =>
        item.id === servicesIntroSection.id
          ? { ...item, content: { ...(item.content || {}), [key]: value } }
          : item
      )
    )
  }

  const updateTestimonialsField = (key, value) => {
    if (!testimonialsSection) return
    updateSectionContent(testimonialsSection.id, {
      ...testimonialsContent,
      [key]: value,
    })
  }

  const updateLeadLeakDetectorField = (key, value) => {
    if (!leadLeakDetectorSection) return
    updateSectionContent(leadLeakDetectorSection.id, {
      ...leadLeakDetectorContent,
      [key]: value,
    })
  }

  const updateLeadLeakDetectorList = (text) => {
    updateLeadLeakDetectorField(
      'items',
      text
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }

  const updateTestimonialItemField = (index, key, value) => {
    if (!testimonialsSection) return
    const items = Array.isArray(testimonialsContent.testimonials)
      ? [...testimonialsContent.testimonials]
      : []
    items[index] = {
      ...(items[index] || {}),
      [key]: value,
    }
    updateSectionContent(testimonialsSection.id, {
      ...testimonialsContent,
      testimonials: items,
    })
  }

  const saveSettings = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const normalizedSettings = normalizeWebsiteSettings(settings)
      const hasLogoFile = Boolean(brandingFiles.logo)
      const payload = hasLogoFile ? new FormData() : normalizedSettings

      if (hasLogoFile) {
        Object.entries(normalizedSettings || {}).forEach(([key, value]) => {
          if (value == null) return
          if (typeof value === 'boolean') {
            payload.append(key, value ? '1' : '0')
            return
          }
          if (typeof value === 'object') {
            payload.append(key, JSON.stringify(value))
          } else {
            payload.append(key, value)
          }
        })
        payload.append('logo', brandingFiles.logo)
      }

      const updated = await systemCompanyWebsiteService.updateSettings(payload)
      setSettings(normalizeWebsiteSettings(updated))
      setBrandingFiles({ logo: null })
      setMessage('Website settings saved successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const saveSection = async (section, content) => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await systemCompanyWebsiteService.updateHomepageSection(section.id, { content })
      setSections((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setMessage(`${section.title || section.type} updated successfully.`)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save section.')
    } finally {
      setSaving(false)
    }
  }

  const saveLeadLeakDetectorSection = async () => {
    if (!leadLeakDetectorSection) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const hasAppImage = Boolean(leadLeakDetectorFiles.app_image)
      const payload = hasAppImage ? new FormData() : { content: leadLeakDetectorContent }

      if (hasAppImage) {
        payload.append('content', JSON.stringify(leadLeakDetectorContent))
        payload.append('app_slide_image', leadLeakDetectorFiles.app_image)
      }

      const updated = await systemCompanyWebsiteService.updateHomepageSection(leadLeakDetectorSection.id, payload)
      setSections((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setLeadLeakDetectorFiles({ app_image: null })
      setMessage('Carousel settings updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save carousel settings.')
    } finally {
      setSaving(false)
    }
  }

  const saveAboutSection = async () => {
    if (!aboutSection) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const formData = new FormData()
      formData.append('content', JSON.stringify(aboutContent))
      if (aboutImageFiles.primary_image) {
        formData.append('primary_image', aboutImageFiles.primary_image)
      }
      if (aboutImageFiles.secondary_image) {
        formData.append('secondary_image', aboutImageFiles.secondary_image)
      }

      const updated = await systemCompanyWebsiteService.updateHomepageSection(aboutSection.id, formData)
      setSections((prev) => prev.map((item) => (item.id === aboutSection.id ? updated : item)))
      setAboutImageFiles({
        primary_image: null,
        secondary_image: null,
      })
      setMessage('About section updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save About section.')
    } finally {
      setSaving(false)
    }
  }

  const savePortfolioSection = async () => {
    if (!portfolioSection) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const formData = new FormData()
      formData.append('content', JSON.stringify(portfolioContent))
      if (portfolioImageFiles[0]) formData.append('portfolio_card_1_image', portfolioImageFiles[0])
      if (portfolioImageFiles[1]) formData.append('portfolio_card_2_image', portfolioImageFiles[1])
      if (portfolioImageFiles[2]) formData.append('portfolio_card_3_image', portfolioImageFiles[2])

      const updated = await systemCompanyWebsiteService.updateHomepageSection(portfolioSection.id, formData)
      setSections((prev) => prev.map((item) => (item.id === portfolioSection.id ? updated : item)))
      setPortfolioImageFiles({ 0: null, 1: null, 2: null })
      setMessage('Portfolio section updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save Portfolio section.')
    } finally {
      setSaving(false)
    }
  }

  const saveTestimonialsSection = async () => {
    if (!testimonialsSection) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const formData = new FormData()
      formData.append('content', JSON.stringify(testimonialsContent))
      for (let i = 0; i < 6; i += 1) {
        if (testimonialImageFiles[i]) {
          formData.append(`testimonial_${i + 1}_avatar`, testimonialImageFiles[i])
        }
      }

      const updated = await systemCompanyWebsiteService.updateHomepageSection(testimonialsSection.id, formData)
      setSections((prev) => prev.map((item) => (item.id === testimonialsSection.id ? updated : item)))
      setTestimonialImageFiles({
        0: null,
        1: null,
        2: null,
        3: null,
        4: null,
        5: null,
      })
      setMessage('Testimonials section updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save Testimonials section.')
    } finally {
      setSaving(false)
    }
  }

  const saveService = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      if (editingServiceId) {
        const updated = await systemCompanyWebsiteService.updateService(editingServiceId, serviceForm)
        setServices((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        setMessage('Service updated successfully.')
      } else {
        const created = await systemCompanyWebsiteService.createService(serviceForm)
        setServices((prev) => [...prev, created])
        setMessage('Service created successfully.')
      }
      setServiceForm(emptyService)
      setEditingServiceId(null)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save service.')
    } finally {
      setSaving(false)
    }
  }

  const saveCareerPage = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await systemCompanyWebsiteService.updateCareerPage({
        content: careerPage?.content || {},
        is_active: careerPage?.is_active !== false,
      })
      setCareerPage(updated)
      setMessage('Careers page updated successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save careers page.')
    } finally {
      setSaving(false)
    }
  }

  const saveCareerRole = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      if (editingCareerRoleId) {
        const updated = await systemCompanyWebsiteService.updateCareerRole(editingCareerRoleId, careerRoleForm)
        setCareerRoles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        setMessage('Career role updated successfully.')
      } else {
        const created = await systemCompanyWebsiteService.createCareerRole(careerRoleForm)
        setCareerRoles((prev) => [...prev, created])
        setMessage('Career role created successfully.')
      }

      setCareerRoleForm(emptyCareerRole)
      setEditingCareerRoleId(null)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save career role.')
    } finally {
      setSaving(false)
    }
  }

  const editCareerRole = (role) => {
    setEditingCareerRoleId(role.id)
    setCareerRoleForm({
      title: role.title || '',
      slug: role.slug || '',
      department: role.department || '',
      location: role.location || '',
      work_type: role.work_type || '',
      employment_type: role.employment_type || '',
      experience_level: role.experience_level || '',
      summary: role.summary || '',
      description: role.description || '',
      responsibilities: Array.isArray(role.responsibilities) ? role.responsibilities : [],
      requirements: Array.isArray(role.requirements) ? role.requirements : [],
      benefits: Array.isArray(role.benefits) ? role.benefits : [],
      sort_order: role.sort_order || 0,
      is_featured: role.is_featured === true,
      is_active: role.is_active !== false,
    })
  }

  const removeCareerRole = async (roleId) => {
    if (!window.confirm('Delete this career role?')) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await systemCompanyWebsiteService.deleteCareerRole(roleId)
      setCareerRoles((prev) => prev.filter((item) => item.id !== roleId))
      setMessage('Career role deleted successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete career role.')
    } finally {
      setSaving(false)
    }
  }

  const editService = (service) => {
    setEditingServiceId(service.id)
    setServiceForm({
      name: service.name || '',
      short_description: service.short_description || '',
      description: service.description || '',
      cta_text: service.cta_text || 'Request a Demo',
      form_name: service.form_name || '',
      is_active: service.is_active !== false,
    })
  }

  const removeService = async (serviceId) => {
    if (!window.confirm('Delete this service?')) return
    setSaving(true)
    setError('')
    try {
      await systemCompanyWebsiteService.deleteService(serviceId)
      setServices((prev) => prev.filter((item) => item.id !== serviceId))
      setMessage('Service deleted successfully.')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete service.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-[var(--muted-text)]">Loading website CMS...</div>
  }

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-[var(--content-text)]">
          <span>Company Website</span>
          <span className="text-[var(--muted-text)]">/</span>
          <span className="text-blue-600">{activeTabLabel}</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Manage besouhola.com content, homepage sections, services, and analytics.
        </p>
      </div>

      {message ? <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

      {activeTab === 'settings' && settings ? (
        <div className="space-y-6">
          <div className="sticky top-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Settings Changes</h2>
              <p className="mt-1 text-xs text-slate-500">
                Save your company info, branding, and contact page updates.
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={saveSettings}
              className="inline-flex min-w-[160px] items-center justify-center rounded-xl border border-blue-700 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:grid-cols-2">
            {[
              ['company_name', 'Company Name'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['whatsapp', 'WhatsApp'],
              ['primary_color', 'Primary Color'],
              ['seo_title', 'SEO Title'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                  value={settings[key] || ''}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                />
              </label>
            ))}
            <div className="block text-sm">
              <span className="mb-1 block text-[var(--muted-text)]">Logo Upload</span>
              {settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt={settings.company_name || 'Company logo'}
                  className="mb-3 h-20 w-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 object-contain"
                />
              ) : null}
              <input
                type="file"
                accept="image/*"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                onChange={(e) =>
                  setBrandingFiles((prev) => ({
                    ...prev,
                    logo: e.target.files?.[0] || null,
                  }))
                }
              />
              <span className="mt-1 block text-xs text-[var(--muted-text)]">
                {brandingFiles.logo
                  ? `Selected: ${brandingFiles.logo.name}`
                  : 'Upload a logo image to replace the current one.'}
              </span>
            </div>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted-text)]">Address</span>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                rows={3}
                value={settings.address || ''}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted-text)]">SEO Description</span>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                rows={3}
                value={settings.seo_description || ''}
                onChange={(e) => setSettings({ ...settings, seo_description: e.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-lg font-semibold">Social Links</h2>
              <p className="mt-1 text-sm text-[var(--muted-text)]">
                These icons appear in the public website footer only when a valid link exists.
              </p>
            </div>

            {[
              ['facebook', 'Facebook'],
              ['whatsapp', 'WhatsApp'],
              ['twitter', 'Twitter / X'],
              ['linkedin', 'LinkedIn'],
              ['instagram', 'Instagram'],
              ['github', 'GitHub'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    value={settings.social_links?.[key] || ''}
                    onChange={(e) =>
                      setSettings({
                      ...settings,
                      social_links: {
                        ...(settings.social_links || {}),
                        [key]: e.target.value,
                      },
                    })
                  }
                />
                {key === 'whatsapp' ? (
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">
                    You can paste a phone number or a full WhatsApp link.
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-lg font-semibold">Contact Page</h2>
              <p className="mt-1 text-sm text-[var(--muted-text)]">
                Control the messaging and contact labels shown on the public contact page.
              </p>
            </div>

            {[
              ['headline', 'Headline'],
              ['headline_accent', 'Headline Accent'],
              ['sales_label', 'Sales Label'],
              ['phone_label', 'Phone Label'],
              ['whatsapp_label', 'WhatsApp Label'],
              ['address_label', 'Address Label'],
              ['website_label', 'Website Label'],
              ['website_text', 'Website Text'],
              ['website_url', 'Website URL'],
              ['social_label', 'Social Label'],
              ['form_title', 'Form Title'],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                  value={contactPageContent[key] || ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      contact_page_content: {
                        ...contactPageContent,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}

            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted-text)]">Description</span>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                rows={3}
                value={contactPageContent.description || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    contact_page_content: {
                      ...contactPageContent,
                      description: e.target.value,
                    },
                  })
                }
              />
            </label>

            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--muted-text)]">Form Subtitle</span>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                rows={3}
                value={contactPageContent.form_subtitle || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    contact_page_content: {
                      ...contactPageContent,
                      form_subtitle: e.target.value,
                    },
                  })
                }
              />
            </label>
          </div>

          <div>
            <button
              type="button"
              disabled={saving}
              onClick={saveSettings}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'homepage' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {homepageSubTabs.map((tab) => {
              const isActive = homepageSubTab === tab

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setHomepageSubTab(tab)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-text)] hover:border-blue-300 hover:text-[var(--text)]'
                  }`}
                >
                  {homepageSubTabLabels[tab]}
                </button>
              )
            })}
          </div>

          {homepageSubTab === 'hero' && heroSection ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Hero</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  Edit only the hero fields currently used on the public website.
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Hero Content
                    </h3>
                  </div>

                {[
                  ['badge', 'Top Badge'],
                  ['headline', 'Headline'],
                  ['headline_accent', 'Headline Accent'],
                  ['secondary_cta', 'Secondary CTA'],
                  ['form_badge', 'Form Badge'],
                  ['form_title', 'Form Title'],
                  ['form_side_title', 'Form Side Title'],
                  ['form_button_text', 'Form Button Text'],
                  ['name_label', 'Name Label'],
                  ['name_placeholder', 'Name Placeholder'],
                  ['phone_label', 'Phone Label'],
                  ['phone_placeholder', 'Phone Placeholder'],
                  ['email_label', 'Email Label'],
                  ['email_placeholder', 'Email Placeholder'],
                  ['service_label', 'Service Label'],
                  ['service_placeholder', 'Service Placeholder'],
                  ['message_label', 'Message Label'],
                  ['privacy_note', 'Privacy Note'],
                  ['success_title', 'Success Title'],
                  ['success_reset_text', 'Success Reset Button'],
                ].map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                      value={heroContent[key] || ''}
                      onChange={(e) => updateHeroField(key, e.target.value)}
                    />
                  </label>
                ))}
                </div>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Subtitle</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={3}
                    value={heroContent.subtitle || ''}
                    onChange={(e) => updateHeroField('subtitle', e.target.value)}
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Form Subtitle</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={3}
                    value={heroContent.form_subtitle || ''}
                    onChange={(e) => updateHeroField('form_subtitle', e.target.value)}
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Form Fields
                    </h3>
                  </div>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Message Placeholder</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={2}
                    value={heroContent.message_placeholder || ''}
                    onChange={(e) => updateHeroField('message_placeholder', e.target.value)}
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Success Message</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={2}
                    value={heroContent.success_message || ''}
                    onChange={(e) => updateHeroField('success_message', e.target.value)}
                  />
                </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Lists And Stats
                    </h3>
                  </div>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Benefit Points</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={(heroContent.benefit_points || []).join('\n')}
                    onChange={(e) => updateHeroList('benefit_points', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One point per line.</span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Form Panel Points</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={(heroContent.form_panel_points || []).join('\n')}
                    onChange={(e) => updateHeroList('form_panel_points', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One point per line.</span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Service Options</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={(heroContent.service_options || []).join('\n')}
                    onChange={(e) => updateHeroList('service_options', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One option per line.</span>
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Stats</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm"
                    rows={4}
                    value={(heroContent.stats || [])
                      .map((item) => `${item.value || ''} | ${item.label || ''}`)
                      .join('\n')}
                    onChange={(e) => updateHeroStats(e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">
                    Use one stat per line in this format: value | label
                  </span>
                </label>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted-text)]">
                  اضغط على الزر لحفظ أي تعديل في قسم الهيرو على الموقع.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveSection(heroSection, heroContent)}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {saving ? 'Saving...' : 'Save Hero'}
                </button>
              </div>
            </div>
          ) : null}

          {homepageSubTab === 'trusted_clients' && trustedClientsSection ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Trusted Clients</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  Control the trust section headline and the client names shown on the public website.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Eyebrow</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    value={trustedClientsContent.eyebrow || ''}
                    onChange={(e) => updateTrustedClientsField('eyebrow', e.target.value)}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">Highlighted Text</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    value={trustedClientsContent.highlight_text || ''}
                    onChange={(e) => updateTrustedClientsField('highlight_text', e.target.value)}
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Headline Suffix</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    value={trustedClientsContent.headline_suffix || ''}
                    onChange={(e) => updateTrustedClientsField('headline_suffix', e.target.value)}
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Client Names</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={8}
                    value={(trustedClientsContent.clients || []).join('\n')}
                    onChange={(e) => updateTrustedClientsList(e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted-text)]">One client per line.</span>
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted-text)]">
                  اضغط على الزر لحفظ أي تعديل في هذا السيكشن على الموقع.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveSection(trustedClientsSection, trustedClientsContent)}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {saving ? 'Saving...' : 'Save Trusted Clients'}
                </button>
              </div>
            </div>
          ) : null}

          {homepageSubTab === 'about' && aboutSection ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">About</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  Control the About section images, titles, and content blocks shown on the public website.
                </p>
              </div>

              <div className="space-y-6">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                  <button
                    type="button"
                    onClick={() => toggleAboutPanel('primary')}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Primary Block
                    </span>
                    <span className="text-lg text-[var(--muted-text)]">
                      {aboutPanels.primary ? '−' : '+'}
                    </span>
                  </button>

                  {aboutPanels.primary ? (
                    <div className="grid gap-4 border-t border-[var(--border)] px-4 py-4 md:grid-cols-2">
                      <div className="block text-sm md:col-span-2">
                        <span className="mb-2 block text-[var(--muted-text)]">Primary Image</span>
                        {aboutContent.primary_image_url ? (
                          <img
                            src={aboutContent.primary_image_url}
                            alt={aboutContent.primary_image_alt || 'Primary about'}
                            className="mb-3 h-40 w-full rounded-lg border border-[var(--border)] object-cover md:w-80"
                          />
                        ) : null}
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          onChange={(e) =>
                            setAboutImageFiles((prev) => ({
                              ...prev,
                              primary_image: e.target.files?.[0] || null,
                            }))
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          {aboutImageFiles.primary_image
                            ? `Selected: ${aboutImageFiles.primary_image.name}`
                            : 'Upload a new image to replace the current one.'}
                        </span>
                      </div>

                      {[
                        ['primary_image_alt', 'Primary Image Alt'],
                        ['primary_title', 'Primary Title'],
                        ['primary_title_accent', 'Primary Title Accent'],
                        ['primary_card_one_title', 'Primary Card One Title'],
                        ['primary_card_two_title', 'Primary Card Two Title'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                            value={aboutContent[key] || ''}
                            onChange={(e) => updateAboutField(key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Primary Card One Body</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          rows={4}
                          value={aboutContent.primary_card_one_body || ''}
                          onChange={(e) => updateAboutField('primary_card_one_body', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Primary Card Two Body</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          rows={6}
                          value={aboutContent.primary_card_two_body || ''}
                          onChange={(e) => updateAboutField('primary_card_two_body', e.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                  <button
                    type="button"
                    onClick={() => toggleAboutPanel('secondary')}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-text)]">
                      Secondary Block
                    </span>
                    <span className="text-lg text-[var(--muted-text)]">
                      {aboutPanels.secondary ? '−' : '+'}
                    </span>
                  </button>

                  {aboutPanels.secondary ? (
                    <div className="grid gap-4 border-t border-[var(--border)] px-4 py-4 md:grid-cols-2">
                      <div className="block text-sm md:col-span-2">
                        <span className="mb-2 block text-[var(--muted-text)]">Secondary Image</span>
                        {aboutContent.secondary_image_url ? (
                          <img
                            src={aboutContent.secondary_image_url}
                            alt={aboutContent.secondary_image_alt || 'Secondary about'}
                            className="mb-3 h-40 w-full rounded-lg border border-[var(--border)] object-cover md:w-80"
                          />
                        ) : null}
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          onChange={(e) =>
                            setAboutImageFiles((prev) => ({
                              ...prev,
                              secondary_image: e.target.files?.[0] || null,
                            }))
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          {aboutImageFiles.secondary_image
                            ? `Selected: ${aboutImageFiles.secondary_image.name}`
                            : 'Upload a new image to replace the current one.'}
                        </span>
                      </div>

                      {[
                        ['secondary_image_alt', 'Secondary Image Alt'],
                        ['secondary_title', 'Secondary Title'],
                        ['secondary_title_accent', 'Secondary Title Accent'],
                        ['secondary_card_one_title', 'Secondary Card One Title'],
                        ['secondary_card_two_title', 'Secondary Card Two Title'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                            value={aboutContent[key] || ''}
                            onChange={(e) => updateAboutField(key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Secondary Card One Body</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          rows={4}
                          value={aboutContent.secondary_card_one_body || ''}
                          onChange={(e) => updateAboutField('secondary_card_one_body', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Secondary Card Two Body</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          rows={4}
                          value={aboutContent.secondary_card_two_body || ''}
                          onChange={(e) => updateAboutField('secondary_card_two_body', e.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted-text)]">
                  Use this save button to publish About section content changes to the public website.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveAboutSection}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {saving ? 'Saving...' : 'Save About'}
                </button>
              </div>
            </div>
          ) : null}

          {homepageSubTab === 'portfolio' && portfolioSection ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Portfolio</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  Control the industry solutions section heading, description, and portfolio cards shown on the public website.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['eyebrow', 'Eyebrow'],
                  ['title', 'Title'],
                  ['title_accent', 'Title Accent'],
                ].map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                      value={portfolioContent[key] || ''}
                      onChange={(e) => updatePortfolioField(key, e.target.value)}
                    />
                  </label>
                ))}

                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--muted-text)]">Description</span>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    rows={4}
                    value={portfolioContent.description || ''}
                    onChange={(e) => updatePortfolioField('description', e.target.value)}
                  />
                </label>
              </div>

              <div className="mt-6 space-y-6">
                {(portfolioContent.cards || []).map((card, index) => (
                  <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <h3 className="mb-4 text-base font-semibold">Card {index + 1}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="block text-sm md:col-span-2">
                        <span className="mb-2 block text-[var(--muted-text)]">Card Image</span>
                        {card.image_url ? (
                          <img
                            src={card.image_url}
                            alt={card.image_alt || `Portfolio card ${index + 1}`}
                            className="mb-3 h-40 w-full rounded-lg border border-[var(--border)] object-cover md:w-80"
                          />
                        ) : null}
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          onChange={(e) =>
                            setPortfolioImageFiles((prev) => ({
                              ...prev,
                              [index]: e.target.files?.[0] || null,
                            }))
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          {portfolioImageFiles[index]
                            ? `Selected: ${portfolioImageFiles[index].name}`
                            : 'Upload a new image to replace the current one.'}
                        </span>
                      </div>

                      {[
                        ['slug', 'Project Slug'],
                        ['title', 'Card Title'],
                        ['metric', 'Metric'],
                        ['image_alt', 'Image Alt'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                            value={card[key] || ''}
                            onChange={(e) => updatePortfolioCardField(index, key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Card Description</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          rows={3}
                          value={card.description || ''}
                          onChange={(e) => updatePortfolioCardField(index, 'description', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted-text)]">
                  Use this save button to publish Portfolio section changes to the public website.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={savePortfolioSection}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {saving ? 'Saving...' : 'Save Portfolio'}
                </button>
              </div>
            </div>
          ) : null}

          {homepageSubTab === 'testimonials' && testimonialsSection ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold">Testimonials</h2>
                <p className="mt-1 text-sm text-[var(--muted-text)]">
                  Control the testimonials heading and customer quotes shown in the public website slider.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ['title', 'Title'],
                  ['title_accent', 'Title Accent'],
                  ['title_suffix', 'Title Suffix'],
                ].map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                      value={testimonialsContent[key] || ''}
                      onChange={(e) => updateTestimonialsField(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-6 space-y-6">
                {(testimonialsContent.testimonials || []).map((item, index) => (
                  <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <h3 className="mb-4 text-base font-semibold">Testimonial {index + 1}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="block text-sm md:col-span-2">
                        <span className="mb-2 block text-[var(--muted-text)]">Avatar</span>
                        {item.avatar ? (
                          <img
                            src={item.avatar}
                            alt={item.name || `Testimonial ${index + 1}`}
                            className="mb-3 h-20 w-20 rounded-full border border-[var(--border)] object-cover"
                          />
                        ) : null}
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          onChange={(e) =>
                            setTestimonialImageFiles((prev) => ({
                              ...prev,
                              [index]: e.target.files?.[0] || null,
                            }))
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          {testimonialImageFiles[index]
                            ? `Selected: ${testimonialImageFiles[index].name}`
                            : 'Upload a new avatar to replace the current one.'}
                        </span>
                      </div>

                      {[
                        ['name', 'Name'],
                        ['role', 'Role'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                            value={item[key] || ''}
                            onChange={(e) => updateTestimonialItemField(index, key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Quote</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          rows={4}
                          value={item.content || ''}
                          onChange={(e) => updateTestimonialItemField(index, 'content', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted-text)]">
                  Use this save button to publish Testimonials section changes to the public website.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveTestimonialsSection}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {saving ? 'Saving...' : 'Save Testimonials'}
                </button>
              </div>
            </div>
          ) : null}

          {homepageSubTab === 'more_sections' ? (
            <div className="space-y-6">
              {leadLeakDetectorSection ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <div className="mb-5 flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Carousel Settings</h2>
                      <p className="mt-1 text-sm text-[var(--muted-text)]">
                        Manage each carousel view in its own tab so the homepage promo stays organized and easier to edit.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveLeadLeakDetectorSection}
                      className="inline-flex min-w-[190px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                    >
                      {saving ? 'Saving...' : 'Save Carousel Settings'}
                    </button>
                  </div>

                  <div className="mb-5 flex flex-wrap gap-3">
                    {carouselSettingsTabs.map((tab) => {
                      const isActive = carouselSettingsTab === tab
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setCarouselSettingsTab(tab)}
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                            isActive
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-blue-400 hover:text-blue-600'
                          }`}
                        >
                          {carouselSettingsTabLabels[tab]}
                        </button>
                      )
                    })}
                  </div>

                  {carouselSettingsTab === 'app_slide' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        ['app_eyebrow', 'App Eyebrow'],
                        ['app_headline', 'App Headline'],
                        ['app_title', 'App Slide Title'],
                        ['app_button_text', 'App Slide Button Text'],
                        ['app_availability_text', 'App Availability Text'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                            value={leadLeakDetectorContent[key] || ''}
                            onChange={(e) => updateLeadLeakDetectorField(key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">App Slide Subtitle</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={3}
                          value={leadLeakDetectorContent.app_subtitle || ''}
                          onChange={(e) => updateLeadLeakDetectorField('app_subtitle', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">App Slide Description</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={3}
                          value={leadLeakDetectorContent.app_description || ''}
                          onChange={(e) => updateLeadLeakDetectorField('app_description', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">App Slide Image</span>
                        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                          {leadLeakDetectorContent.app_image_url ? (
                            <img
                              src={leadLeakDetectorContent.app_image_url}
                              alt="App slide preview"
                              className="h-40 w-full rounded-lg border border-[var(--border)] object-cover"
                            />
                          ) : null}
                          <input
                            type="file"
                            accept="image/*"
                            className="block w-full text-sm"
                            onChange={(e) =>
                              setLeadLeakDetectorFiles((prev) => ({
                                ...prev,
                                app_image: e.target.files?.[0] || null,
                              }))
                            }
                          />
                          <span className="block text-xs text-[var(--muted-text)]">
                            {leadLeakDetectorFiles.app_image
                              ? `Selected: ${leadLeakDetectorFiles.app_image.name}`
                              : 'Upload a new image to replace the current app slide.'}
                          </span>
                        </div>
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">App Slide Items</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={4}
                          value={Array.isArray(leadLeakDetectorContent.app_items) ? leadLeakDetectorContent.app_items.join('\n') : ''}
                          onChange={(e) =>
                            updateLeadLeakDetectorField(
                              'app_items',
                              e.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                            )
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          These chips appear inside the first app showcase slide.
                        </span>
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">App Left Highlights</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={4}
                          value={Array.isArray(leadLeakDetectorContent.app_highlights) ? leadLeakDetectorContent.app_highlights.join('\n') : ''}
                          onChange={(e) =>
                            updateLeadLeakDetectorField(
                              'app_highlights',
                              e.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                            )
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          These badges appear on the left side when the app slide is active.
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {carouselSettingsTab === 'audit_slide' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        ['eyebrow', 'Eyebrow'],
                        ['title', 'Title'],
                        ['button_text', 'Main Button Text'],
                        ['floating_button_text', 'Floating Button Text'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                            value={leadLeakDetectorContent[key] || ''}
                            onChange={(e) => updateLeadLeakDetectorField(key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Subtitle</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={3}
                          value={leadLeakDetectorContent.subtitle || ''}
                          onChange={(e) => updateLeadLeakDetectorField('subtitle', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Quick Value Points</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={4}
                          value={Array.isArray(leadLeakDetectorContent.items) ? leadLeakDetectorContent.items.join('\n') : ''}
                          onChange={(e) => updateLeadLeakDetectorList(e.target.value)}
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          One short promise per line.
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {carouselSettingsTab === 'integration_slide' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        ['integration_eyebrow', 'Integration Eyebrow'],
                        ['integration_headline', 'Integration Headline'],
                        ['integration_title', 'Integration Slide Title'],
                        ['integration_button_text', 'Integration Slide Button Text'],
                      ].map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                          <input
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                            value={leadLeakDetectorContent[key] || ''}
                            onChange={(e) => updateLeadLeakDetectorField(key, e.target.value)}
                          />
                        </label>
                      ))}

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Integration Slide Subtitle</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={3}
                          value={leadLeakDetectorContent.integration_subtitle || ''}
                          onChange={(e) => updateLeadLeakDetectorField('integration_subtitle', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Integration Description</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={3}
                          value={leadLeakDetectorContent.integration_description || ''}
                          onChange={(e) => updateLeadLeakDetectorField('integration_description', e.target.value)}
                        />
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Integration Slide Items</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={4}
                          value={Array.isArray(leadLeakDetectorContent.integration_items) ? leadLeakDetectorContent.integration_items.join('\n') : ''}
                          onChange={(e) =>
                            updateLeadLeakDetectorField(
                              'integration_items',
                              e.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                            )
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          One integration per line for the rotating card.
                        </span>
                      </label>

                      <label className="block text-sm md:col-span-2">
                        <span className="mb-1 block text-[var(--muted-text)]">Integration Left Highlights</span>
                        <textarea
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          rows={4}
                          value={Array.isArray(leadLeakDetectorContent.integration_highlights) ? leadLeakDetectorContent.integration_highlights.join('\n') : ''}
                          onChange={(e) =>
                            updateLeadLeakDetectorField(
                              'integration_highlights',
                              e.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                            )
                          }
                        />
                        <span className="mt-1 block text-xs text-[var(--muted-text)]">
                          These badges appear on the left side when the integration slide is active.
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {carouselSettingsTab === 'result_cta' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 block text-[var(--muted-text)]">Result CTA Text</span>
                        <input
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          value={leadLeakDetectorContent.result_cta_text || ''}
                          onChange={(e) => updateLeadLeakDetectorField('result_cta_text', e.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveLeadLeakDetectorSection}
                    className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
                  >
                    Save {leadLeakDetectorSection.title || leadLeakDetectorSection.type}
                  </button>
                </div>
              ) : null}

              {servicesIntroSection ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <div className="mb-5">
                    <h2 className="text-lg font-semibold">{servicesIntroSection.title || 'Services Intro'}</h2>
                    <p className="mt-1 text-sm text-[var(--muted-text)]">
                      Control the heading, description, and tags shown above the services list.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ['title', 'Title'],
                      ['title_accent', 'Title Accent'],
                    ].map(([key, label]) => (
                      <label key={key} className="block text-sm">
                        <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                        <input
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          value={servicesIntroSection.content?.[key] || ''}
                          onChange={(e) => updateServicesIntroField(key, e.target.value)}
                        />
                      </label>
                    ))}

                    <label className="block text-sm md:col-span-2">
                      <span className="mb-1 block text-[var(--muted-text)]">Description</span>
                      <textarea
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                        rows={4}
                        value={servicesIntroSection.content?.description || ''}
                        onChange={(e) => updateServicesIntroField('description', e.target.value)}
                      />
                    </label>

                    <label className="block text-sm md:col-span-2">
                      <span className="mb-1 block text-[var(--muted-text)]">Tags</span>
                      <textarea
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                        rows={4}
                        value={Array.isArray(servicesIntroSection.content?.tags) ? servicesIntroSection.content.tags.join('\n') : ''}
                        onChange={(e) =>
                          updateServicesIntroField(
                            'tags',
                            e.target.value
                              .split('\n')
                              .map((item) => item.trim())
                              .filter(Boolean)
                          )
                        }
                      />
                      <span className="mt-1 block text-xs text-[var(--muted-text)]">One tag per line.</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveSection(servicesIntroSection, servicesIntroSection.content || {})}
                    className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
                  >
                    Save {servicesIntroSection.title || servicesIntroSection.type}
                  </button>
                </div>
              ) : null}

              {ctaSection ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <div className="mb-5">
                    <h2 className="text-lg font-semibold">Closing CTA</h2>
                    <p className="mt-1 text-sm text-[var(--muted-text)]">
                      Keep this section lightweight: a strong headline, a reassurance line, and one button that jumps back to the hero form.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ['headline', 'Headline'],
                      ['headline_accent', 'Headline Accent'],
                      ['button_text', 'Button Text'],
                    ].map(([key, label]) => (
                      <label key={key} className="block text-sm">
                        <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                        <input
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          value={ctaSection.content?.[key] || ''}
                          onChange={(e) =>
                            setSections((prev) =>
                              prev.map((item) =>
                                item.id === ctaSection.id
                                  ? { ...item, content: { ...(item.content || {}), [key]: e.target.value } }
                                  : item
                              )
                            )
                          }
                        />
                      </label>
                    ))}

                    <label className="block text-sm md:col-span-2">
                      <span className="mb-1 block text-[var(--muted-text)]">Reassurance Line</span>
                      <textarea
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                        rows={3}
                        value={ctaSection.content?.subtitle || ''}
                        onChange={(e) =>
                          setSections((prev) =>
                            prev.map((item) =>
                              item.id === ctaSection.id
                                ? { ...item, content: { ...(item.content || {}), subtitle: e.target.value } }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveSection(ctaSection, ctaSection.content || {})}
                    className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
                  >
                    Save Closing CTA
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'analytics' ? <WebsiteAnalyticsPanel /> : null}

      {activeTab === 'careers' ? (
        <WebsiteCareersPanel
          saving={saving}
          careerPage={careerPage}
          setCareerPage={setCareerPage}
          saveCareerPage={saveCareerPage}
          careerRoles={careerRoles}
          roleForm={careerRoleForm}
          setRoleForm={setCareerRoleForm}
          editingCareerRoleId={editingCareerRoleId}
          saveCareerRole={saveCareerRole}
          editCareerRole={editCareerRole}
          removeCareerRole={removeCareerRole}
          cancelCareerRoleEdit={() => {
            setEditingCareerRoleId(null)
            setCareerRoleForm(emptyCareerRole)
          }}
          careerApplications={careerApplications}
        />
      ) : null}

      {activeTab === 'services' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {editingServiceId ? 'Edit Service' : 'Add Service'}
            </h2>
            <div className="space-y-3">
              {[
                ['name', 'Name'],
                ['short_description', 'Short Description'],
                ['cta_text', 'CTA Text'],
                ['form_name', 'Form Name'],
              ].map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-text)]">{label}</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    value={serviceForm[key] || ''}
                    onChange={(e) => setServiceForm({ ...serviceForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-text)]">Description</span>
                <textarea
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                  rows={4}
                  value={serviceForm.description || ''}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={serviceForm.is_active !== false}
                  onChange={(e) => setServiceForm({ ...serviceForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveService}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingServiceId ? 'Update Service' : 'Create Service'}
                </button>
                {editingServiceId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingServiceId(null)
                      setServiceForm(emptyService)
                    }}
                    className="rounded-lg border border-[var(--border)] px-4 py-2"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {services.map((service) => (
              <div key={service.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{service.name}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-text)]">{service.short_description}</p>
                    <p className="mt-2 text-xs text-[var(--muted-text)]">
                      {service.is_active ? 'Active' : 'Inactive'} · {service.slug}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => editService(service)} className="text-sm text-[var(--primary)]">
                      Edit
                    </button>
                    <button type="button" onClick={() => removeService(service.id)} className="text-sm text-red-400">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
