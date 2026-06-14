import React from 'react';
import { motion } from 'framer-motion';
import { Facebook, Github, Instagram, Linkedin, Twitter } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import crmLogoMark from '../../../../../frontend/src/assets/be-souhola-logo-dark-collapse.png';

const Footer = () => {
  const navigate = useNavigate();

  const handleNavClick = (e) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute('href');
    const [path, id] = href.split('#');

    if (path && path !== '/' && path !== '') {
      navigate(path);
      if (id) {
        setTimeout(() => {
          const targetElement = document.getElementById(id);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    navigate('/');
    setTimeout(() => {
      if (id) {
        const targetElement = document.getElementById(id);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  const footerSections = [
    {
      title: 'Company',
      links: [
        { name: 'Contact', href: '/contact' },
        { name: 'Careers', href: '/career' },
        { name: 'Privacy Policy', href: '/privacy' },
        { name: 'Terms & Conditions', href: '/terms' },
        { name: 'Data Processing & Security', href: '/data-processing-security' },
      ],
    },
    {
      title: 'Quick Links',
      links: [
        { name: 'Visit Main Site', href: 'https://besouhola.com', external: true },
      ],
    },
  ];

  const socialLinks = [
    { icon: Github, name: 'Github', href: '#' },
    { icon: Twitter, name: 'Twitter', href: '#' },
    { icon: Linkedin, name: 'LinkedIn', href: '#' },
    { icon: Instagram, name: 'Instagram', href: '#' },
    { icon: Facebook, name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61587661674565' },
  ];

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
                  src={crmLogoMark}
                  alt="Be Souhola CRM logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-white">
                  Be <span className="text-accent-purple">Souhola</span>{' '}
                  <span className="text-white/72">CRM</span>
                </div>
                <div className="text-sm text-white/45">
                  CRM for growth, follow-up, and smarter operations
                </div>
              </div>
            </Link>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {['Services', 'About', 'Portfolio', 'Testimonials'].map((label) => {
                const hrefMap = {
                  Services: '/#services',
                  About: '/#about',
                  Portfolio: '/#portfolio',
                  Testimonials: '/#testimonials',
                };

                return (
                  <a
                    key={label}
                    href={hrefMap[label]}
                    onClick={handleNavClick}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/70 transition-colors duration-300 hover:border-accent-purple/35 hover:text-white"
                  >
                    {label}
                  </a>
                );
              })}
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
              Built for better follow-up, clearer pipelines, and smarter growth.
            </h3>
            <p className="mt-4 max-w-[36rem] text-[15px] leading-8 text-gray-400">
              Be Souhola is a CRM platform designed for real estate teams and ambitious businesses that need clearer pipelines, faster follow-up, and better visibility across operations.
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
          <p className="text-gray-500 text-center md:text-left">
            &copy; {new Date().getFullYear()} Be Souhola. All Rights Reserved.
          </p>

          <div className="flex justify-center gap-3 md:justify-end">
            {socialLinks.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.name}
                  href={social.href}
                  target={social.href !== '#' ? '_blank' : undefined}
                  rel={social.href !== '#' ? 'noopener noreferrer' : undefined}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-gray-400 transition-all duration-300 hover:border-accent-purple/35 hover:text-accent-purple"
                >
                  <Icon size={18} />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
