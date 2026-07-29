import React from 'react';
import { motion } from 'framer-motion';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const Stats = () => {
  const { stats: statsSection } = useWebsiteContent();
  const items = Array.isArray(statsSection?.items) ? statsSection.items : [];

  return (
    <section className="py-24 bg-[#0C0D0D]">
      <div className="container mx-auto px-6">
        {statsSection?.title ? (
          <div className="mb-16">
            <h2 className="text-section-title font-bold text-white uppercase">
              {statsSection.title}{' '}
              <span className="text-accent-purple">{statsSection.title_accent}</span>
            </h2>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {items.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-5xl md:text-6xl font-bold text-accent-purple mb-3">
                {stat.number}
              </div>
              <div className="text-label font-semibold text-white mb-2">{stat.label}</div>
              <p className="text-gray-400">{stat.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
