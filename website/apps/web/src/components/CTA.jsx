import React from 'react';
import { motion } from 'framer-motion';
import AnimatedCtaBackground from '@/components/AnimatedCtaBackground';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const CTA = () => {
  const { cta } = useWebsiteContent();

  return (
    <section id="cta" className="relative py-24 md:py-32 overflow-hidden">
      <AnimatedCtaBackground />
      <div className="absolute inset-0 bg-black/50" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight uppercase">
              {cta.headline}{' '}
              <span className="text-accent-purple">{cta.headline_accent}</span>?
            </h2>
            <p className="mx-auto max-w-2xl text-lg md:text-xl text-gray-300 mb-10">
              {cta.subtitle}
            </p>
            <a
              href="/contact#lead-form"
              className="inline-flex items-center justify-center rounded-full bg-accent-purple px-8 py-4 text-base font-semibold text-white transition hover:scale-[1.02] hover:bg-accent-purple/90"
            >
              {cta.button_text || 'Start Now'}
            </a>
            <p className="mt-4 text-sm text-gray-400">
              Your request takes you straight to the contact form.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
