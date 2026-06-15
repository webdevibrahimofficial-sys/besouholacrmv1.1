import React from 'react';
import { motion } from 'framer-motion';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const TrustedClients = () => {
  const { trustedClients } = useWebsiteContent();
  const clients = Array.isArray(trustedClients?.clients) ? trustedClients.clients.filter(Boolean) : [];

  return (
    <section className="py-16 bg-[#0C0D0D] border-y border-white/10">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-2">
            {trustedClients?.eyebrow || 'Trusted by industry leaders'}
          </p>
          <h3 className="text-2xl md:text-3xl font-bold text-white">
            <span className="text-accent-purple">
              {trustedClients?.highlight_text || '50+ industries/businesses'}
            </span>{' '}
            {trustedClients?.headline_suffix || 'trust Be Souhola'}
          </h3>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {clients.map((client, index) => (
            <motion.div
              key={client}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex items-center justify-center p-6 bg-[#1E1E2A] rounded-xl border border-white/10 hover:border-accent-purple/30 transition-colors duration-300"
            >
              <span className="text-gray-300 font-semibold text-center text-sm">{client}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustedClients;
