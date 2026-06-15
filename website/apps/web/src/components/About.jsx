import React from 'react';
import { motion } from 'framer-motion';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const About = () => {
  const { about } = useWebsiteContent();

  return (
    <section id="about" className="py-24 bg-[#0C0D0D] overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <div className="rounded-2xl overflow-hidden aspect-[4/3]">
              <img
                className="w-full h-full object-cover"
                alt={about.primary_image_alt}
                src={about.primary_image_url}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight text-white uppercase">
              {about.primary_title}{' '}
              <span className="text-accent-purple">{about.primary_title_accent}</span>
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">{about.primary_card_one_title}</h3>
                <p className="text-lg text-gray-400">
                  {about.primary_card_one_body}
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">{about.primary_card_two_title}</h3>
                <p className="text-lg text-gray-400">
                  {about.primary_card_two_body}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-center mt-24">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="lg:order-last"
          >
            <div className="rounded-2xl overflow-hidden aspect-[4/3]">
              <img
                className="w-full h-full object-cover"
                alt={about.secondary_image_alt}
                src={about.secondary_image_url}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight text-white uppercase">
              {about.secondary_title}{' '}
              <span className="text-accent-purple">{about.secondary_title_accent}</span>
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">{about.secondary_card_one_title}</h3>
                <p className="text-lg text-gray-400">
                  {about.secondary_card_one_body}
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">{about.secondary_card_two_title}</h3>
                <p className="text-lg text-gray-400">
                  {about.secondary_card_two_body}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default About;
