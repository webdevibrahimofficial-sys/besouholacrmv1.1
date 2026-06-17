import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { trackCtaClick } from '@/lib/analytics';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import crmLogoMark from '@/assets/be-souhola-logo-dark.png';
import { resolveImageFallback } from '@/lib/websiteAssets';

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const { settings } = useWebsiteContent();
  const logoSrc = settings?.logo_url || crmLogoMark;
  const companyName = settings?.company_name || 'Be Souhola';
  const navLinks = [
    { name: 'Services', href: '/#services' },
    { name: 'About', href: '/#about' },
    { name: 'Portfolio', href: '/#portfolio' },
    { name: 'Testimonials', href: '/#testimonials' },
    { name: 'Careers', href: '/career' }
  ];

  const handleScroll = () => {
    if (window.scrollY > 10) {
      setIsScrolled(true);
    } else {
      setIsScrolled(false);
    }
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleSmoothScroll = (e) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute('href');
    const [pathname, hashTarget] = String(href || '').split('#');

    if (hashTarget) {
      navigate({
        pathname: pathname || '/',
        hash: `#${hashTarget}`,
      });
    } else {
      navigate(pathname || '/');
    }

    if (isOpen) {
      setIsOpen(false);
    }
  };

  const handleHomeClick = (e) => {
    e.preventDefault();
    navigate('/');
    if (isOpen) {
      setIsOpen(false);
    }
  };

  const handleCTA = () => {
    trackCtaClick('Book Free Demo', { meta: { location: 'header' } });
    navigate('/contact#lead-form');
    if (isOpen) {
      setIsOpen(false);
    }
  };

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-black/70 border-b border-white/10 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.34)]'
            : 'bg-black/38 backdrop-blur-lg'
        }`}
      >
        <div className="flex h-[3.85rem] w-full items-center justify-between px-4 sm:h-[4.1rem] sm:px-5 lg:px-7">
          <Link to="/" onClick={handleHomeClick} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:h-11 sm:w-11">
              <img
                src={logoSrc}
                alt={`${companyName} CRM logo`}
                className="h-full w-full object-contain"
                onError={(event) => resolveImageFallback(event, crmLogoMark)}
              />
            </div>
            <div className="text-base font-semibold tracking-tight text-white sm:text-[1.08rem]">
              {companyName.split(' ')[0] || 'Be'} <span className="text-accent-purple">{companyName.split(' ').slice(1).join(' ') || 'Souhola'}</span>{' '}
              <span className="text-white/72">CRM</span>
            </div>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 md:flex items-center gap-6 rounded-full border border-white/12 bg-black/28 px-4 py-2 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.22)] lg:gap-7 lg:px-5">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={handleSmoothScroll}
                className="relative text-[0.92rem] font-medium text-gray-200 transition-colors hover:text-white group"
              >
                {link.name}
                <span className="absolute left-0 -bottom-1 w-0 h-0.5 bg-accent-purple transition-all duration-300 group-hover:w-full"></span>
              </a>
            ))}
          </nav>

          <div className="ml-auto hidden md:flex items-center gap-4">
            <Button
              className="group rounded-full bg-accent-purple px-4 py-2 text-sm text-white shadow-[0_10px_30px_rgba(147,114,255,0.35)] hover:bg-accent-purple/90"
              onClick={handleCTA}
            >
              Book Demo <ArrowRight className="ml-2 h-4 w-4 transform transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </div>

          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="text-white">
              <Menu size={28} />
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: '-100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '-100%' }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="fixed inset-0 bg-[#0C0D0D] z-50 md:hidden"
          >
            <div className="flex h-full w-full flex-col px-6">
              <div className="flex h-16 items-center justify-between">
                <Link to="/" onClick={handleHomeClick} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                    <img
                      src={logoSrc}
                      alt={`${companyName} CRM logo`}
                      className="h-full w-full object-contain"
                      onError={(event) => resolveImageFallback(event, crmLogoMark)}
                    />
                  </div>
                  <div className="text-lg font-semibold tracking-tight text-white">
                    {companyName.split(' ')[0] || 'Be'} <span className="text-accent-purple">{companyName.split(' ').slice(1).join(' ') || 'Souhola'}</span>{' '}
                    <span className="text-white/72">CRM</span>
                  </div>
                </Link>
                <button onClick={() => setIsOpen(false)} className="text-white">
                  <X size={28} />
                </button>
              </div>

              <nav className="flex-grow flex flex-col justify-center items-center gap-8">
                {navLinks.map((link, index) => (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    onClick={handleSmoothScroll}
                    className="text-3xl font-semibold text-gray-300 hover:text-accent-purple transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                  >
                    {link.name}
                  </motion.a>
                ))}
              </nav>

              <div className="py-8 flex flex-col gap-4">
                <Button
                  className="bg-accent-purple text-white hover:bg-accent-purple/90 group w-full text-lg py-6 rounded-full"
                  onClick={handleCTA}
                >
                  Book Demo <ArrowRight className="ml-2 h-4 w-4 transform transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
