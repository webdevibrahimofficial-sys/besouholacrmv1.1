export const defaultWebsiteContent = {
  settings: {
    company_name: 'Be Souhola',
    logo_url: '',
    phone: '+1 (555) 234-5678',
    email: 'sales@besouhola.com',
    whatsapp: null,
    address: '200 Tech Boulevard, Suite 400, Innovation City, CA 94102',
    website_url: 'https://besouhola.com',
    social_links: {
      facebook: 'https://www.facebook.com/profile.php?id=61587661674565',
      whatsapp: null,
    },
    nav_links: [
      { name: 'Services', href: '/#services' },
      { name: 'About', href: '/#about' },
      { name: 'Portfolio', href: '/#portfolio' },
      { name: 'Testimonials', href: '/#testimonials' },
      { name: 'Careers', href: '/career' },
    ],
    nav_cta_text: 'Book Free Demo',
    nav_cta_href: '/contact',
    footer_sections: [
      {
        title: 'Company',
        links: [
          { name: 'Contact', href: '/contact', external: false },
          { name: 'Careers', href: '/career', external: false },
          { name: 'Privacy Policy', href: '/privacy', external: false },
          { name: 'Terms & Conditions', href: '/terms', external: false },
          { name: 'Data Processing & Security', href: '/data-processing-security', external: false },
        ],
      },
      {
        title: 'Quick Links',
        links: [{ name: 'Visit Main Site', href: '{main_website}', external: true }],
      },
    ],
    footer_quick_links: [
      { name: 'Services', href: '/#services' },
      { name: 'About', href: '/#about' },
      { name: 'Portfolio', href: '/#portfolio' },
      { name: 'Testimonials', href: '/#testimonials' },
    ],
    footer_tagline: 'Built for better follow-up, clearer pipelines, and smarter growth.',
    footer_description:
      'Be Souhola is a CRM platform designed for real estate teams and ambitious businesses that need clearer pipelines, faster follow-up, and better visibility across operations.',
    whatsapp_float: {
      enabled: false,
      message: "Hi, I'd like to learn more about Be Souhola CRM.",
      tooltip: 'Chat with us',
    },
    pages_seo: {
      home: {
        title: 'Be Souhola - CRM Platform for Real Estate & Business',
        description:
          'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.',
        canonical: 'https://besouhola.com',
      },
      contact: {
        title: 'Contact Be Souhola - Schedule Your Demo',
        description:
          'Get in touch with Be Souhola to schedule a demo, request support, or learn how our CRM platform can transform your business operations.',
        canonical: 'https://besouhola.com/contact',
      },
      career: {
        title: 'Careers at Be Souhola CRM',
        description:
          'Explore career opportunities at Be Souhola CRM and help build a smarter growth platform for ambitious teams.',
        canonical: 'https://besouhola.com/career',
      },
      privacy: {
        title: 'Privacy Policy | Be Souhola CRM',
        description:
          'This Privacy Policy governs how Be Souhola CRM collects, uses, processes, stores, and protects personal and business-related information.',
        canonical: 'https://besouhola.com/privacy',
      },
      terms: {
        title: 'Terms & Conditions | Be Souhola CRM',
        description:
          'These Terms & Conditions govern the use of the Be Souhola CRM mobile application, web application, and related services provided by Be Souhola.',
        canonical: 'https://besouhola.com/terms',
      },
      data_processing_security: {
        title: 'Data Processing & Security Statement | Be Souhola CRM',
        description:
          'This statement describes the general principles applied by Be Souhola CRM in connection with data processing, confidentiality, hosting, and security.',
        canonical: 'https://besouhola.com/data-processing-security',
      },
    },
    contact_page_content: {
      headline: "Let's",
      headline_accent: 'connect',
      description:
        'Schedule a demo, get support, or learn how Be Souhola can transform your business operations.',
      sales_label: 'Sales & Demos',
      phone_label: 'Phone',
      whatsapp_label: 'WhatsApp',
      address_label: 'Our Office',
      website_label: 'Website',
      website_text: 'besouhola.com',
      website_url: 'https://besouhola.com',
      social_label: 'Facebook',
      form_title: 'Book Your Free CRM Demo',
      form_subtitle: "Tell us about your business and we'll contact you within 24 hours.",
    },
    primary_color: '#9372FF',
    seo_title: 'Be Souhola - CRM Platform for Real Estate & Business',
    seo_description:
      'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.',
  },
  sections: {
    hero: {
      badge: 'AI-Powered CRM Platform',
      headline: 'One Intelligent CRM',
      headline_accent: 'Built for Your Growth',
      subtitle:
        'Capture leads, automate follow-ups, and close deals faster.',
      primary_cta: 'Book Free Demo',
      secondary_cta: 'Explore Features',
      dashboard_panel: {
        title: 'Dashboard',
        demo_cta_text: 'See how it works',
        pipeline_title: 'Pipeline stages',
        pipeline_stages: [
          { label: 'TOTAL LEADS', value: '248', color: 'blue' },
          { label: 'NEW', value: '86', color: 'green' },
          { label: 'DUPLICATE', value: '32', color: 'red' },
          { label: 'PENDING', value: '98', color: 'yellow' },
          { label: 'COLD CALLS', value: '32', color: 'orange' },
        ],
        delay_leads_count: '18',
        delay_leads_title: 'Delay Leads',
        delay_leads_description: 'Leads need follow-up',
        delay_leads_helper_text: 'Take action to close more deals',
        ranking: [
          { name: 'Ahmed Mohamed', actions: 128 },
          { name: 'Mona Adel', actions: 96 },
          { name: 'Omar Mostafa', actions: 74 },
        ],
        ranking_title: 'Ranking',
        ranking_actions_label: 'Actions',
        ranking_cta_text: 'View full ranking ->',
      },
      outer_stats: [
        { value: '500+', label: 'Businesses trust us' },
        { value: '24h', label: 'Avg response time' },
        { value: '38%', label: 'Faster deal closing' },
      ],
      form_title: 'Book Your Free CRM Demo',
      form_subtitle: "Tell us about your business and we'll contact you within 24 hours.",
      form_badge: 'CRM Demo',
      form_side_title: 'Why Teams Choose Us',
      form_button_text: 'Request Free Demo',
      name_label: 'Full name *',
      name_placeholder: 'John Doe',
      phone_label: 'Phone number *',
      phone_placeholder: '+20 100 000 0000',
      email_label: 'Email (optional)',
      email_placeholder: 'you@company.com',
      service_label: 'Business Type *',
      service_placeholder: 'Select your business type',
      message_label: 'Notes (optional)',
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
    trusted_clients: {
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
    },
    about: {
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
    },
    portfolio: {
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
    },
    testimonials: {
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
    },
    stats: {
      title: 'Numbers that',
      title_accent: 'speak for themselves',
      items: [
        { number: '12,000+', label: 'Active Users', description: 'Businesses trust Be Souhola' },
        {
          number: '50+',
          label: 'Industries/Businesses',
          description: 'Across real estate and enterprise sectors',
        },
        { number: '99.9%', label: 'Uptime', description: 'Reliable performance you can count on' },
        { number: '24/7', label: 'Real-time Processing', description: 'Instant data synchronization' },
      ],
    },
    services_intro: {
      title: 'PLATFORM',
      title_accent: 'FEATURES',
      description:
        'Be Souhola is a software company specializing in developing advanced Customer Relationship Management (CRM) solutions designed to support business growth and enhance operational efficiency.',
      tags: ['CRM', 'Real Estate', 'AI Automation', 'Analytics'],
    },
    lead_leak_detector: {
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
        'All leads in one place',
        'Instant assignment',
        'Faster follow-up',
      ],
      integration_title: '',
      integration_subtitle:
        '',
      integration_items: [
        'Meta Leads',
        'Website Forms',
        'Website Chat',
        'Google Ads',
        'WhatsApp',
        'Email Notifications',
      ],
      integration_button_text: '',
      result_cta_text: 'Book a result-based demo',
      result_secondary_text: 'See how Be Souhola closes these leaks',
      modal_title: 'Lead Leak Detector',
      modal_subtitle:
        'A guided sales health check that shows where your pipeline is losing qualified leads before they turn into revenue.',
      modal_note: '7 quick questions. No sensitive financial data. Instant result.',
      modal_start_text: 'Start diagnosis',
      report_prompt:
        'Want a walkthrough tailored to your result? See how Be Souhola fixes these leaks with automation, alerts, and performance reporting.',
      solution_heading: 'Your Issue -> Be Souhola Solution',
      estimated_loss_label: 'Estimated revenue drag',
      estimated_loss_low: 'Minor leakage pressure',
      estimated_loss_medium: 'Moderate leakage pressure',
      estimated_loss_high: 'High leakage pressure',
      risk_low_label: 'Low',
      risk_medium_label: 'Medium',
      risk_high_label: 'High',
      leak_labels: {
        speed: 'First-contact delay',
        followup: 'Follow-up process',
        visibility: 'Sales visibility',
        handoff: 'Lead assignment flow',
        qualification: 'Lead qualification',
      },
      solution_map: {
        speed: 'Instant alerts and automatic lead routing',
        followup: 'Follow-up reminders and structured cadences',
        visibility: 'Live team performance dashboards',
        handoff: 'Ownership rules and SLA tracking',
        qualification: 'Structured intake forms and lead scoring',
      },
      questions: [
        {
          prompt: 'How long does it usually take before your team makes the first contact with a new lead?',
          options: [
            { label: 'Less than 5 minutes', score: 100, leak: 'speed' },
            { label: '5 to 30 minutes', score: 82, leak: 'speed' },
            { label: '30 minutes to 2 hours', score: 56, leak: 'speed' },
            { label: 'More than 2 hours', score: 24, leak: 'speed' },
            { label: 'We do not know', score: 18, leak: 'visibility' },
          ],
        },
        {
          prompt: 'How are new leads assigned to the sales team today?',
          options: [
            { label: 'Automatically and instantly', score: 100, leak: 'handoff' },
            { label: 'Manually but with clear ownership', score: 78, leak: 'handoff' },
            { label: 'Shared inbox or group chat', score: 46, leak: 'handoff' },
            { label: 'Often unclear or delayed', score: 20, leak: 'handoff' },
          ],
        },
        {
          prompt: 'What usually happens if a lead does not respond after the first outreach?',
          options: [
            { label: 'Automatic reminders keep follow-up consistent', score: 100, leak: 'followup' },
            { label: 'The team follows up manually with a process', score: 74, leak: 'followup' },
            { label: 'Follow-up depends on each rep', score: 42, leak: 'followup' },
            { label: 'Many leads are forgotten', score: 12, leak: 'followup' },
          ],
        },
        {
          prompt: 'How visible is team performance across the pipeline?',
          options: [
            { label: 'We have live dashboards by stage and owner', score: 100, leak: 'visibility' },
            { label: 'We review reports weekly', score: 76, leak: 'visibility' },
            { label: 'Mostly spreadsheets and manual checks', score: 40, leak: 'visibility' },
            { label: 'Very limited visibility', score: 14, leak: 'visibility' },
          ],
        },
        {
          prompt: 'How are leads qualified before sales spends time on them?',
          options: [
            { label: 'Clear qualification rules and forms', score: 100, leak: 'qualification' },
            { label: 'Some qualification questions exist', score: 70, leak: 'qualification' },
            { label: 'Qualification is inconsistent', score: 38, leak: 'qualification' },
            { label: 'Almost no qualification process', score: 16, leak: 'qualification' },
          ],
        },
        {
          prompt: 'How many channels feed leads into your pipeline?',
          options: [
            { label: 'All channels flow into one system', score: 100, leak: 'handoff' },
            { label: 'Most channels are connected', score: 78, leak: 'handoff' },
            { label: 'Some channels are disconnected', score: 44, leak: 'visibility' },
            { label: 'Many channels are handled separately', score: 18, leak: 'visibility' },
          ],
        },
        {
          prompt: 'When a manager asks where deals are getting stuck, how fast can the team answer?',
          options: [
            { label: 'Immediately with live pipeline data', score: 100, leak: 'visibility' },
            { label: 'Within the same day', score: 74, leak: 'visibility' },
            { label: 'It takes manual digging', score: 36, leak: 'visibility' },
            { label: 'We usually cannot answer clearly', score: 10, leak: 'visibility' },
          ],
        },
      ],
    },
    integration_badge: {
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
      result_cta_text: 'Book a result-based demo',
    },
    cta: {
      headline: 'Ready to Transform Your',
      headline_accent: 'Business',
      subtitle:
        'Join hundreds of businesses already using Be Souhola to streamline operations, boost sales, and build stronger client relationships.',
      button_text: 'Start Now',
      highlights: [
        'Boost conversion rates by up to 38%',
        'Go live in days, not months',
        'Dedicated onboarding support',
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Everything you need',
      title_accent: 'to know',
      items: [
        {
          question: 'How long does it take to set up Be Souhola?',
          answer:
            'Most teams are fully onboarded within 2-3 business days with guided setup support included.',
        },
        {
          question: 'Can I import my existing leads from Excel or another CRM?',
          answer:
            'Yes. Be Souhola supports bulk lead import via Excel/CSV, and our team can help map your existing data fields.',
        },
        {
          question: 'Does Be Souhola work for non-real-estate businesses?',
          answer:
            'Absolutely. The platform is customizable for sales-driven businesses across consulting, healthcare, education, and more.',
        },
        {
          question: 'Is WhatsApp integration included in all plans?',
          answer:
            'WhatsApp support depends on your setup and plan configuration, and our team can help you choose the right rollout.',
        },
        {
          question: 'Can I control which features my team sees?',
          answer:
            'Yes. Role-based access control helps define exactly what each user can see and do inside the platform.',
        },
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
