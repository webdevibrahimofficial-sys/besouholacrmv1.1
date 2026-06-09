import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { trackServiceView } from '@/lib/analytics';

const Services = () => {
  const { services, servicesIntro } = useWebsiteContent();
  const [activeIndex, setActiveIndex] = useState(0);

  const handleServiceClick = (index) => {
    const service = services[index];
    if (activeIndex !== index && service) {
      trackServiceView(service.slug || service.name, service.name);
    }
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <section id="services" className="py-24 bg-[#0C0D0D]">
      <div className="container mx-auto px-6 relative z-10">
        <div className="mb-16">
          <h2 className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight text-white uppercase">
            {servicesIntro.title}{' '}
            <span className="text-accent-purple">{servicesIntro.title_accent}</span>
          </h2>
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mt-4">
            {servicesIntro.description}
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            {(servicesIntro.tags || []).map((tag) => (
              <button
                key={tag}
                className="px-5 py-2 border border-gray-600 rounded-full text-gray-400 cursor-default uppercase"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-800">
          {services.map((service, index) => (
            <div key={service.id || service.name} className="border-b border-gray-800">
              <div
                className="flex justify-between items-center cursor-pointer py-8 group"
                onClick={() => handleServiceClick(index)}
              >
                <div className="flex items-center gap-4">
                  <h3
                    className={`text-3xl md:text-5xl font-bold transition-colors duration-300 ${
                      activeIndex === index
                        ? 'text-white'
                        : 'text-gray-600 group-hover:text-gray-400'
                    }`}
                  >
                    {service.name}
                  </h3>
                  {activeIndex === index && (
                    <motion.div
                      className="w-4 h-4 bg-accent-purple rounded-full"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    />
                  )}
                </div>

                <motion.div
                  className="text-accent-purple"
                  animate={{ rotate: activeIndex === index ? 45 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Plus
                    size={40}
                    className={`${
                      activeIndex === index
                        ? 'text-accent-purple'
                        : 'text-gray-600 group-hover:text-gray-400'
                    } transition-colors`}
                  />
                </motion.div>
              </div>

              <AnimatePresence>
                {activeIndex === index && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -20 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pb-8 pr-16">
                      <p className="text-lg text-gray-400 max-w-2xl">
                        {service.description || service.short_description}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
