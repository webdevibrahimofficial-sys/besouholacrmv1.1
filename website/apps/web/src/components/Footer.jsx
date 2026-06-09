import React from 'react';
import { Github, Twitter, Linkedin, Instagram, Facebook } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Footer = () => {
  const navigate = useNavigate();

  const handleNavClick = (e) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute('href');
    const [path, id] = href.split('#');

    if (path === '/' || path === '') {
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
    }
  };

  const footerSections = [
    {
      title: 'Platform',
      links: [
        { name: 'Features', href: '/#services' },
        { name: 'Solutions', href: '/#portfolio' },
        { name: 'Pricing', href: '#' },
        { name: 'Documentation', href: '#' }
      ]
    },
    {
      title: 'Company',
      links: [
        { name: 'About Us', href: '/#about' },
        { name: 'Contact', href: '/contact' },
        { name: 'Blog', href: '#' },
        { name: 'Careers', href: '#' }
      ]
    },
    {
      title: 'Resources',
      links: [
        { name: 'Help Center', href: '#' },
        { name: 'Security', href: '#' },
        { name: 'Privacy Policy', href: '#' },
        { name: 'Terms of Service', href: '#' }
      ]
    },
    {
      title: 'Quick Links',
      links: [
        { name: 'Visit Us', href: 'https://besouhola.com', external: true }
      ]
    }
  ];

  const socialLinks = [
    { icon: <Github size={20} />, name: 'Github', href: '#' },
    { icon: <Twitter size={20} />, name: 'Twitter', href: '#' },
    { icon: <Linkedin size={20} />, name: 'Linkedin', href: '#' },
    { icon: <Instagram size={20} />, name: 'Instagram', href: '#' },
    { icon: <Facebook size={20} />, name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61587661674565' }
  ];

  return (
    <footer className="bg-[#0C0D0D] border-t border-white/10 pt-16 pb-8">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          <div className="lg:col-span-1">
            <img 
              src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/49e5fc512fe9f5468e81f2135e55bdb4.png" 
              alt="Be Souhola Logo" 
              className="h-12 md:h-16 w-auto object-contain mb-6"
            />
            <p className="text-gray-400 leading-relaxed">
              Be Souhola is a leading CRM platform designed for real estate professionals and businesses across industries. We empower teams with intelligent relationship management, real-time analytics, and AI-driven automation.
            </p>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <p className="font-semibold text-white mb-6">{section.title}</p>
              <ul className="space-y-4">
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
                          } else if (link.href.includes('#')) {
                            handleNavClick(e);
                          }
                        }
                      }}
                      className="text-gray-400 hover:text-accent-purple transition-colors duration-300"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-gray-500 text-center md:text-left">
            &copy; {new Date().getFullYear()} Be Souhola. All Rights Reserved.
          </p>
          <div className="flex space-x-4">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target={social.href !== '#' ? '_blank' : undefined}
                rel={social.href !== '#' ? 'noopener noreferrer' : undefined}
                className="text-gray-400 hover:text-accent-purple transition-colors duration-300"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;