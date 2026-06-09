import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Headphones, TrendingUp } from 'lucide-react';
import AnimatedCtaBackground from '@/components/AnimatedCtaBackground';
import LeadForm from '@/components/LeadForm';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const highlightIcons = [TrendingUp, Clock, Headphones];

const CTA = () => {
  const { cta } = useWebsiteContent();

  return (
    <section id="cta" className="relative py-24 md:py-32 overflow-hidden">
      <AnimatedCtaBackground />
      <div className="absolute inset-0 bg-black/50" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight uppercase">
              {cta.headline}{' '}
              <span className="text-accent-purple">{cta.headline_accent}</span>?
            </h2>
            <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-lg">
              {cta.subtitle}
            </p>

            <ul className="space-y-4">
              {(cta.highlights || []).map((text, index) => {
                const Icon = highlightIcons[index % highlightIcons.length];
                return (
                  <li key={text} className="flex items-center gap-3 text-gray-300">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-purple/15">
                      <Icon className="h-5 w-5 text-accent-purple" />
                    </span>
                    {text}
                  </li>
                );
              })}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <LeadForm formName="CTA Section Form" />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
