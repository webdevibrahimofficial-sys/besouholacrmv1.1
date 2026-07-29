import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const FAQ = () => {
  const { faq } = useWebsiteContent();
  const items = Array.isArray(faq?.items) ? faq.items : [];
  const [activeIndex, setActiveIndex] = useState(0);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#0C0D0D] py-24">
      <div className="container relative z-10 mx-auto px-6">
        <div className="mb-16 max-w-3xl">
          <p className="text-sm uppercase tracking-[0.24em] text-white/45">{faq.eyebrow}</p>
          <h2 className="mt-4 text-section-title font-bold uppercase text-white">
            {faq.title} <span className="text-accent-purple">{faq.title_accent}</span>
          </h2>
        </div>

        <div className="border-t border-gray-800">
          {items.map((item, index) => {
            const isActive = activeIndex === index;

            return (
              <div key={item.question} className="border-b border-gray-800">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 py-7 text-left group"
                  onClick={() => setActiveIndex(isActive ? -1 : index)}
                >
                  <span className="text-xl font-semibold text-white transition-colors group-hover:text-accent-purple">
                    {item.question}
                  </span>
                  <motion.div
                    animate={{ rotate: isActive ? 45 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="shrink-0 text-accent-purple"
                  >
                    <Plus className="h-7 w-7" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {isActive ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -12 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -12 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-3xl pb-7 pr-10 text-[0.98rem] leading-7 text-gray-400">
                        {item.answer}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
