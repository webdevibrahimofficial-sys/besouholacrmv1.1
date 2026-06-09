import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { trackCtaClick } from '@/lib/analytics';
import crmLogo from '@/assets/be-souhola-logo-dark.png';

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const navLinks = [
    { name: 'Services', href: '/#services' },
    { name: 'About', href: '/#about' },
    { name: 'Portfolio', href: '/#portfolio' },
    { name: 'Testimonials', href: '/#testimonials' }
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
    const [path, id] = href.split('#');

    if (path === '/' && id) {
      navigate(path);
      setTimeout(() => {
        const targetElement = document.getElementById(id);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      navigate(href);
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
            ? 'bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.35)]'
            : 'bg-black/30 backdrop-blur-md'
        }`}
      >
        <div className="w-full px-6 md:px-10 xl:px-14 h-20 flex justify-between items-center">
          <Link to="/" onClick={handleHomeClick} className="flex items-center gap-3">
            <img
              src={crmLogo}
              alt="Be Souhola"
              className="h-11 md:h-[64px] w-auto object-contain"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8 rounded-full border border-white/12 bg-black/30 px-6 py-3 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={handleSmoothScroll}
                className="text-sm font-medium text-gray-200 hover:text-white transition-colors relative group"
              >
                {link.name}
                <span className="absolute left-0 -bottom-1 w-0 h-0.5 bg-accent-purple transition-all duration-300 group-hover:w-full"></span>
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Button
              className="bg-accent-purple text-white hover:bg-accent-purple/90 group rounded-full px-6 shadow-[0_10px_30px_rgba(147,114,255,0.35)]"
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
            <div className="w-full px-6 md:px-10 h-full flex flex-col">
              <div className="flex justify-between items-center h-20">
                <Link to="/" onClick={handleHomeClick} className="flex items-center">
                  <img 
                    src={crmLogo} 
                    alt="Be Souhola" 
                    className="h-11 w-auto object-contain"
                  />
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
