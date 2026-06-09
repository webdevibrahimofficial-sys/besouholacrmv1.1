import React from 'react';
import { motion } from 'framer-motion';

const stats = [
  {
    number: '12,000+',
    label: 'Active Users',
    description: 'Businesses trust Be Souhola'
  },
  {
    number: '50+',
    label: 'Industries/Businesses',
    description: 'Across real estate and enterprise sectors'
  },
  {
    number: '99.9%',
    label: 'Uptime',
    description: 'Reliable performance you can count on'
  },
  {
    number: '24/7',
    label: 'Real-time Processing',
    description: 'Instant data synchronization'
  }
];

const Stats = () => {
  return (
    <section className="py-24 bg-[#0C0D0D]">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {stats.map((stat, index) => (
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
              <div className="text-xl font-semibold text-white mb-2">{stat.label}</div>
              <p className="text-gray-400">{stat.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;