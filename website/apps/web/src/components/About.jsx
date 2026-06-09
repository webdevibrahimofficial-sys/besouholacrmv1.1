import React from 'react';
import { motion } from 'framer-motion';

const About = () => {
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
                alt="Modern office with technology team collaborating on CRM development"
                src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/charlesdeluvio-lks7vei-eag-unsplash-7Or6F.jpg"
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
              We're passionate about <span className="text-accent-purple">business transformation</span>
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">CRM platform powered by artificial intelligence</h3>
                <p className="text-lg text-gray-400">
                  This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision.
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">Focus on measurable impact</h3>
                <p className="text-lg text-gray-400">
                  Our mission is to empower companies to build a smart business ecosystem that connects sales teams, customer service, and management within one flexible and customizable platform. We aim to enhance customer experience, improve operational efficiency, and support decision-making through real-time analytics and intelligent AI-driven tools, ensuring sustainable growth and long-term competitive advantage.
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
                alt="Diverse team collaborating on CRM strategy and implementation"
                src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/whatsapp-image-2026-02-16-at-9.34.48-pm-1-crJEf.jpeg"
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
              Your success, our <span className="text-accent-purple">technology</span>
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">Our vision for the future</h3>
                <p className="text-lg text-gray-400">
                  Our vision is to become the leading technology partner for companies in the real estate sector and other industries by providing an integrated CRM platform powered by artificial intelligence. This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision.
                </p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">Built for scalability and growth</h3>
                <p className="text-lg text-gray-400">
                  This platform enables organizations to manage their relationships and operations more efficiently while keeping pace with digital transformation and the future vision. From startups to enterprise organizations, Be Souhola scales with your business.
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