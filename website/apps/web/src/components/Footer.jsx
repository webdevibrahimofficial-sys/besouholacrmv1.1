import React from 'react';
import { motion } from 'framer-motion';
import { Facebook, Github, Instagram, Linkedin, Twitter } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import crmLogoMark from '@/assets/be-souhola-logo-mark.png';
import { resolveImageFallback } from '@/lib/websiteAssets';

const DEFAULT_FOOTER_SECTIONS = [
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
];

const DEFAULT_QUICK_LINKS = [
  { name: 'Services', href: '/#services' },
  { name: 'About', href: '/#about' },
  { name: 'Portfolio', href: '/#portfolio' },
  { name: 'Testimonials', href: '/#testimonials' },
];

const WhatsAppIcon = ({ size = 18, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M20.5 3.5A11.5 11.5 0 0 0 1.9 17.3L1 23l5.8-1a11.5 11.5 0 0 0 13.7-18.5Zm-8.4 18a9.6 9.6 0 0 1-4.9-1.4l-.35-.2-3.45.6.58-3.35-.23-.37a9.6 9.6 0 1 1 8.34 4.72Zm5.56-6.6c-.3-.15-1.8-.9-2.08-1a.75.75 0 0 0-.55-.03c-.16.05-.42.2-.65.48-.2.23-.8.8-.98.96-.18.17-.36.19-.67.04-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.64-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.39-.03-.54-.08-.15-.66-1.6-.9-2.2-.23-.56-.46-.48-.65-.49h-.56c-.2 0-.54.07-.82.39-.28.32-1.06 1.03-1.06 2.52 0 1.48 1.09 2.91 1.24 3.1.15.2 2.11 3.24 5.12 4.54.72.31 1.28.49 1.72.63.72.23 1.38.2 1.9.12.58-.09 1.8-.73 2.05-1.44.25-.71.25-1.32.18-1.44-.08-.12-.28-.2-.58-.35Z" />
  </svg>
);

const normalizeSocialHref = (name, href) => {
  const value = typeof href === 'string' ? href.trim() : '';
  if (!value) return '';

  if (name === 'whatsapp') {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    const digits = value.replace(/[^\d]/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  }

  return value.startsWith('http://') || value.startsWith('https://') ? value : '';
};

const Footer = () => {
  const navigate = useNavigate();
  const { settings, contactPageContent } = useWebsiteContent();
  const companyName = settings?.company_name || 'Be Souhola';
  const logoSrc = settings?.logo_url || crmLogoMark;
  const mainWebsiteUrl =
    contactPageContent?.website_url || settings?.website_url || 'https://besouhola.com';
  const socialIconMap = {
    github: Github,
    twitter: Twitter,
    linkedin: Linkedin,
    instagram: Instagram,
    facebook: Facebook,
    whatsapp: WhatsAppIcon,
  };

  const socialLinks = Object.entries(settings?.social_links || {})
    .map(([name, href]) => ({
      name,
      href: normalizeSocialHref(name.toLowerCase(), href),
      icon: socialIconMap[name.toLowerCase()],
    }))
    .filter((social) => social.icon && social.href && social.href !== '#');

  const footerSections =
    Array.isArray(settings?.footer_sections) && settings.footer_sections.length > 0
      ? settings.footer_sections.map((section) => ({
          ...section,
          links: Array.isArray(section.links)
            ? section.links.map((link) => ({
                ...link,
                href: link.href === '{main_website}' ? mainWebsiteUrl : link.href,
              }))
            : [],
        }))
      : DEFAULT_FOOTER_SECTIONS.map((section) => ({
          ...section,
          links: section.links.map((link) => ({
            ...link,
            href: link.href === '{main_website}' ? mainWebsiteUrl : link.href,
          })),
        }));
  const quickLinks =
    Array.isArray(settings?.footer_quick_links) && settings.footer_quick_links.length > 0
      ? settings.footer_quick_links
      : DEFAULT_QUICK_LINKS;

  const handleNavClick = (e) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute('href');
    const [path, id] = String(href || '').split('#');

    if (path && path !== '/' && path !== '') {
      navigate(path);
      window.setTimeout(() => {
        if (id) {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
      return;
    }

    navigate('/');
    window.setTimeout(() => {
      if (id) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#0C0D0D] pt-12 pb-8">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-purple/60 to-transparent" />

      <div className="mx-auto w-full max-w-[1720px] px-3 sm:px-4 lg:px-5">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          className="mb-10 flex flex-col gap-6 rounded-[26px] border border-white/10 bg-black/20 px-5 py-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <img
                  src={logoSrc}
                  alt={`${companyName} CRM logo`}
                  className="h-full w-full object-contain"
                  onError={(event) => resolveImageFallback(event, crmLogoMark)}
                />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-white">
                  <span className="text-accent-purple">{companyName.split(' ')[0] || 'Be'}</span>{' '}
                  <span className="text-accent-purple">{companyName.split(' ').slice(1).join(' ') || 'Souhola'}</span>{' '}
                  <span className="text-white/72">CRM</span>
                </div>
                <div className="text-sm text-white/45">
                  {settings?.footer_tagline || 'CRM for growth, follow-up, and smarter operations'}
                </div>
              </div>
            </Link>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {quickLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={handleNavClick}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/70 transition-colors duration-300 hover:border-accent-purple/35 hover:text-white"
                >
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-10 lg:grid-cols-[minmax(0,1.25fr)_220px_220px] lg:items-start lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="max-w-2xl pr-0 lg:pr-8"
          >
            <h3 className="text-xl font-semibold tracking-tight text-white">
              {settings?.footer_tagline || 'Built for better follow-up, clearer pipelines, and smarter growth.'}
            </h3>
            <p className="mt-4 max-w-[36rem] text-[15px] leading-8 text-gray-400">
              {settings?.footer_description ||
                'Be Souhola is a CRM platform designed for real estate teams and ambitious businesses that need clearer pipelines, faster follow-up, and better visibility across operations.'}
            </p>
          </motion.div>

          {footerSections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: 0.08 + index * 0.04 }}
              className="min-w-0"
            >
              <p className="mb-5 text-[1.05rem] font-semibold text-white">{section.title}</p>
              <ul className="space-y-3.5">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      onClick={(e) => {
                        if (!link.external) {
                          if (link.href === '/contact') {
                            e.preventDefault();
                            navigate('/contact#lead-form');
                          } else if (link.href.includes('#') || link.href === '/') {
                            handleNavClick(e);
                          }
                        }
                      }}
                      className="inline-flex text-gray-400 transition-colors duration-300 hover:text-accent-purple"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <p className="text-center text-gray-500 md:text-left">
            &copy; {new Date().getFullYear()} Be Souhola. All Rights Reserved.
          </p>

          {socialLinks.length > 0 ? (
            <div className="flex justify-center gap-3 md:justify-end">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-gray-400 transition-all duration-300 hover:border-accent-purple/35 hover:text-accent-purple"
                  >
                    <Icon size={18} />
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
