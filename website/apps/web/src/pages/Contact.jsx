import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import LeadForm from '@/components/LeadForm';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { trackPhoneClick, trackWhatsappClick } from '@/lib/analytics';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 },
};

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.5,
};
const siteUrl = 'https://besouhola.com';

const normalizeWhatsAppHref = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '#';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : '#';
};

const ContactInfoBlock = ({
  icon: Icon,
  title,
  lines,
  delay,
  isLink = false,
  href = '#',
  onClick,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="flex gap-3"
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10">
      <Icon className="h-4 w-4 text-accent-purple" />
    </div>
    <div>
      <h3 className="mb-1.5 text-sm uppercase tracking-widest text-gray-400">{title}</h3>
      <div className="space-y-1">
        {isLink ? (
          <a
            href={href}
            onClick={onClick}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-[1rem] text-gray-200 transition-colors duration-300 hover:text-accent-purple"
          >
            {lines[0]}
          </a>
        ) : (
          lines.map((line, index) => (
            <p key={index} className="text-[1rem] text-gray-200">
              {line}
            </p>
          ))
        )}
      </div>
    </div>
  </motion.div>
);

const Contact = () => {
  const { settings, leadServiceOptions, contactPageContent } = useWebsiteContent();
  const emailHref = `mailto:${settings.email || 'sales@besouhola.com'}`;
  const phoneHref = `tel:${String(settings.phone || '+1 (555) 234-5678').replace(/[^\d+]/g, '')}`;
  const whatsappHref = normalizeWhatsAppHref(settings.whatsapp);

  useEffect(() => {
    if (window.location.hash === '#lead-form') {
      const timer = setTimeout(() => {
        document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      <Helmet>
        <title>Contact Be Souhola - Schedule Your Demo</title>
        <meta
          name="description"
          content="Get in touch with Be Souhola to schedule a demo, request support, or learn how our CRM platform can transform your business operations."
        />
        <link rel="canonical" href={`${siteUrl}/contact`} />
        <meta property="og:title" content="Contact Be Souhola - Schedule Your Demo" />
        <meta
          property="og:description"
          content="Get in touch with Be Souhola to schedule a demo, request support, or learn how our CRM platform can transform your business operations."
        />
        <meta property="og:url" content={`${siteUrl}/contact`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content="Contact Be Souhola - Schedule Your Demo" />
        <meta
          name="twitter:description"
          content="Get in touch with Be Souhola to schedule a demo, request support, or learn how our CRM platform can transform your business operations."
        />
      </Helmet>

      <section className="bg-[#0C0D0D] text-white pt-16 pb-8 sm:pt-20 sm:pb-10 lg:min-h-[calc(100dvh-4.1rem)] lg:pt-14 lg:pb-6 xl:pt-16 xl:pb-8">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start lg:gap-10 xl:gap-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <h1 className="mb-4 max-w-[10ch] text-[clamp(2.7rem,6vw,4.7rem)] font-bold uppercase leading-[0.92] text-white">
                {contactPageContent.headline}{' '}
                <span className="text-accent-purple">{contactPageContent.headline_accent}</span>
              </h1>
              <p className="mb-6 max-w-[34rem] text-[1rem] leading-[1.55] text-gray-400">
                {contactPageContent.description}
              </p>

              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <ContactInfoBlock
                  icon={Mail}
                  title={contactPageContent.sales_label || 'Sales & Demos'}
                  lines={[settings.email || 'sales@besouhola.com']}
                  delay={0.3}
                  isLink
                  href={emailHref}
                />
                <ContactInfoBlock
                  icon={Phone}
                  title={contactPageContent.phone_label || 'Phone'}
                  lines={[settings.phone || '+1 (555) 234-5678']}
                  delay={0.4}
                  isLink
                  href={phoneHref}
                  onClick={trackPhoneClick}
                />
                {settings.whatsapp ? (
                  <ContactInfoBlock
                    icon={Phone}
                    title={contactPageContent.whatsapp_label || 'WhatsApp'}
                    lines={[settings.whatsapp]}
                    delay={0.45}
                    isLink
                    href={whatsappHref}
                    onClick={trackWhatsappClick}
                  />
                ) : null}
                <ContactInfoBlock
                  icon={MapPin}
                  title={contactPageContent.address_label || 'Our Office'}
                  lines={[settings.address || '200 Tech Boulevard, Suite 400, Innovation City, CA 94102']}
                  delay={0.5}
                />
                <ContactInfoBlock
                  icon={Globe}
                  title={contactPageContent.website_label || 'Website'}
                  lines={[contactPageContent.website_text || 'besouhola.com']}
                  delay={0.6}
                  isLink
                  href={contactPageContent.website_url || 'https://besouhola.com'}
                />
              </div>

              <motion.div
                className="flex items-center gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
              >
                {settings.social_links?.facebook ? (
                  <a
                    href={settings.social_links.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[0.95rem] text-gray-300 transition-colors duration-300 hover:text-accent-purple"
                  >
                    {contactPageContent.social_label || 'Facebook'}
                  </a>
                ) : null}
              </motion.div>
            </motion.div>

            <motion.div
              id="lead-form"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="scroll-mt-28"
            >
              <h2 className="mb-2 text-[1.4rem] font-bold uppercase text-white md:text-[1.55rem]">
                {contactPageContent.form_title || 'Book Your Free CRM Demo'}
              </h2>
              <p className="mb-4 max-w-[34rem] text-[0.95rem] leading-[1.5] text-gray-400">
                {contactPageContent.form_subtitle || "Tell us about your business and we'll contact you within 24 hours."}
              </p>
              <LeadForm
                formName="Contact Page Form"
                serviceOptions={leadServiceOptions}
                showCompanyField
                requireService
                companyLabel="Company Name"
                companyPlaceholder="Your company"
                emailLabel="Email (optional)"
                serviceLabel="Business Type *"
                messageLabel="Notes (optional)"
                submitLabel="Request Free Demo"
              />
            </motion.div>
          </div>
        </div>
      </section>
    </motion.div>
  );
};

export default Contact;
