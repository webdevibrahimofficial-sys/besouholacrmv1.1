import React from 'react';
import { Helmet } from 'react-helmet';
import Hero from '@/components/Hero';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import TrustedClients from '@/components/TrustedClients';
import LeadLeakDetector from '@/components/LeadLeakDetector.jsx';
import Services from '@/components/Services';
import About from '@/components/About';
import Portfolio from '@/components/Portfolio';
import Testimonials from '@/components/Testimonials';
import Stats from '@/components/Stats';
import CTA from '@/components/CTA';
import SectionAnimator from '@/components/SectionAnimator';

const siteUrl = 'https://besouhola.com';

const Home = () => {
  const { settings } = useWebsiteContent();
  const homeTitle = settings.seo_title || 'Be Souhola - CRM Platform for Real Estate & Business';
  const homeDescription =
    settings.seo_description ||
    'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.';
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.company_name || 'Be Souhola',
    url: siteUrl,
    logo: settings.logo_url || undefined,
    sameAs: Object.values(settings.social_links || {}).filter(Boolean),
  };
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: settings.company_name || 'Be Souhola CRM',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: homeDescription,
    url: siteUrl,
  };

  return (
    <>
      <Helmet>
        <title>{homeTitle}</title>
        <meta name="description" content={homeDescription} />
        <link rel="canonical" href={siteUrl} />
        <meta property="og:title" content={homeTitle} />
        <meta property="og:description" content={homeDescription} />
        <meta property="og:url" content={siteUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content={homeTitle} />
        <meta name="twitter:description" content={homeDescription} />
        <script type="application/ld+json">
          {JSON.stringify(organizationSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(softwareSchema)}
        </script>
      </Helmet>
      <Hero />
      <SectionAnimator>
        <LeadLeakDetector />
      </SectionAnimator>
      <SectionAnimator>
        <TrustedClients />
      </SectionAnimator>
      <SectionAnimator>
        <Services />
      </SectionAnimator>
      <About />
      <SectionAnimator>
        <Portfolio />
      </SectionAnimator>
      <SectionAnimator>
        <Testimonials />
      </SectionAnimator>
      <SectionAnimator>
        <Stats />
      </SectionAnimator>
      <SectionAnimator>
        <CTA />
      </SectionAnimator>
    </>
  );
};

export default Home;
