import React from 'react';
import { Helmet } from 'react-helmet';
import Hero from '@/components/Hero';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import TrustedClients, { TrustedClientsFallback } from '@/components/TrustedClients';
import LeadLeakDetector from '@/components/LeadLeakDetector.jsx';
import Services from '@/components/Services';
import About from '@/components/About';
import Portfolio from '@/components/Portfolio';
import Testimonials from '@/components/Testimonials';
import Stats from '@/components/Stats';
import FAQ from '@/components/FAQ';
import CTA from '@/components/CTA';
import SectionAnimator from '@/components/SectionAnimator';
import SectionErrorBoundary from '@/components/SectionErrorBoundary';
import defaultLogoMark from '@/assets/be-souhola-logo-mark.png';

const siteUrl = 'https://besouhola.com';

const Home = () => {
  const { settings, loading } = useWebsiteContent();
  const pageSeo = settings?.pages_seo?.home || {};
  const homeTitle =
    pageSeo.title || settings.seo_title || 'Be Souhola - CRM Platform for Real Estate & Business';
  const homeDescription =
    pageSeo.description ||
    settings.seo_description ||
    'Be Souhola is a leading CRM platform designed for real estate professionals and businesses.';
  const canonicalUrl = pageSeo.canonical || siteUrl;
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.company_name || 'Be Souhola',
    url: siteUrl,
    logo: settings.logo_url || defaultLogoMark,
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0D0D]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-purple border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{homeTitle}</title>
        <meta name="description" content={homeDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={homeTitle} />
        <meta property="og:description" content={homeDescription} />
        <meta property="og:url" content={canonicalUrl} />
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

      <SectionErrorBoundary>
        <SectionAnimator>
          <LeadLeakDetector />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary fallback={<TrustedClientsFallback />}>
        <SectionAnimator>
          <TrustedClients />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <SectionAnimator>
          <Services />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <About />
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <SectionAnimator>
          <Portfolio />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <SectionAnimator>
          <Testimonials />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <SectionAnimator>
          <Stats />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <SectionAnimator>
          <FAQ />
        </SectionAnimator>
      </SectionErrorBoundary>

      <SectionErrorBoundary>
        <SectionAnimator>
          <CTA />
        </SectionAnimator>
      </SectionErrorBoundary>
    </>
  );
};

export default Home;
