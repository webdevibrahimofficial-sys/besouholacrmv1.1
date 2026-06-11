import React from 'react';
import { Helmet } from 'react-helmet';

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'We may collect information you provide directly, such as your name, email address, phone number, company name, and any details you submit through forms, demos, or support requests.',
      'We also collect limited technical data automatically, including device type, browser information, IP address, pages visited, and interaction data used for analytics and product improvement.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'We use collected information to respond to inquiries, provide our services, improve the platform, personalize experiences, perform analytics, and send important service communications.',
      'If you request a demo or contact our team, we may use your details to follow up and provide relevant product or business information.',
    ],
  },
  {
    title: 'Cookies and Tracking',
    body: [
      'Our website may use cookies and similar technologies to remember preferences, measure traffic, and understand how visitors use the site.',
      'You can control cookies through your browser settings, but some features may not work properly if cookies are disabled.',
    ],
  },
  {
    title: 'Sharing of Information',
    body: [
      'We do not sell personal information.',
      'We may share information with trusted service providers who help us operate the website, deliver services, host infrastructure, analyze usage, or communicate with you, subject to confidentiality obligations.',
      'We may also disclose information if required by law, to protect our rights, or to prevent fraud or abuse.',
    ],
  },
  {
    title: 'Data Retention',
    body: [
      'We keep personal information only as long as necessary to fulfill the purposes described in this policy, comply with legal obligations, resolve disputes, and enforce agreements.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use reasonable administrative, technical, and organizational safeguards to protect personal information. However, no method of transmission or storage is completely secure, so we cannot guarantee absolute security.',
    ],
  },
  {
    title: 'Your Rights',
    body: [
      'Depending on your location, you may have rights to access, correct, delete, or restrict the use of your personal information, and to object to certain processing activities.',
      'To exercise your rights, contact us using the details below. We may need to verify your identity before processing your request.',
    ],
  },
  {
    title: 'Third-Party Services',
    body: [
      'Our website may integrate with third-party services such as analytics, hosting, CRM tools, social media platforms, and communication services. Their use of your information is governed by their own privacy policies.',
    ],
  },
  {
    title: 'Changes to This Policy',
    body: [
      'We may update this Privacy Policy from time to time. The updated version will be posted on this page with a revised effective date.',
    ],
  },
  {
    title: 'Contact Us',
    body: [
      'If you have any questions about this Privacy Policy or our data practices, please contact us through the website contact form or email us at the address listed on the contact page.',
    ],
  },
];

const Privacy = () => {
  return (
    <div className="bg-[#0C0D0D] text-white">
      <Helmet>
        <title>Privacy Policy | Be Souhola CRM</title>
        <meta
          name="description"
          content="Read the Be Souhola CRM Privacy Policy to learn how we collect, use, and protect your information."
        />
      </Helmet>

      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(55,121,255,0.16),transparent_28%)]" />
        <div className="relative container mx-auto px-6">
          <div className="max-w-4xl">
            <p className="mb-4 text-sm uppercase tracking-[0.35em] text-gray-400">
              Legal
            </p>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Privacy <span className="text-accent-purple">Policy</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-300">
              Last updated: June 11, 2026
            </p>
            <p className="mt-6 max-w-3xl text-lg text-gray-400 leading-relaxed">
              This Privacy Policy explains how Be Souhola CRM collects, uses,
              stores, and protects information when you visit our website or use
              our services.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-24 sm:pb-32">
        <div className="container mx-auto px-6">
          <div className="mx-auto grid max-w-4xl gap-6">
            {sections.map((section, index) => (
              <article
                key={section.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5"
              >
                <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
                <div className="mt-4 space-y-4 text-gray-300 leading-relaxed">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Privacy;
