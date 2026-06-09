import React from 'react';
import { Helmet } from 'react-helmet';
import Hero from '@/components/Hero';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import TrustedClients from '@/components/TrustedClients';
import Services from '@/components/Services';
import About from '@/components/About';
import Portfolio from '@/components/Portfolio';
import Testimonials from '@/components/Testimonials';
import Stats from '@/components/Stats';
import CTA from '@/components/CTA';
import SectionAnimator from '@/components/SectionAnimator';

const Home = () => {
  const { settings } = useWebsiteContent();

  return (
    <>
      <Helmet>
        <title>{settings.seo_title}</title>
        <meta name="description" content={settings.seo_description} />
      </Helmet>
      <Hero />
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