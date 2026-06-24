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
    className="flex gap-4"
  >
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10">
      <Icon className="h-5 w-5 text-accent-purple" />
    </div>
    <div>
      <h3 className="uppercase text-sm text-gray-400 mb-2 tracking-widest">{title}</h3>
      <div className="space-y-1">
        {isLink ? (
          <a
            href={href}
            onClick={onClick}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-lg text-gray-200 hover:text-accent-purple transition-colors duration-300"
          >
            {lines[0]}
          </a>
        ) : (
          lines.map((line, index) => (
            <p key={index} className="text-lg text-gray-200">
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

      <section className="bg-[#0C0D0D] text-white py-24 sm:py-32">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <h1 className="text-5xl md:text-7xl font-bold text-white uppercase mb-6 leading-tight">
                {contactPageContent.headline}{' '}
                <span className="text-accent-purple">{contactPageContent.headline_accent}</span>
              </h1>
              <p className="text-xl text-gray-400 max-w-md mb-12">
                {contactPageContent.description}
              </p>

              <div className="space-y-8 mb-12">
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
                className="flex items-center gap-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
              >
                {settings.social_links?.facebook ? (
                  <a
                    href={settings.social_links.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg text-gray-300 hover:text-accent-purple transition-colors duration-300"
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
              <h2 className="text-2xl font-bold text-white uppercase mb-2">
                {contactPageContent.form_title || 'Book Your Free CRM Demo'}
              </h2>
              <p className="text-gray-400 mb-6">
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
