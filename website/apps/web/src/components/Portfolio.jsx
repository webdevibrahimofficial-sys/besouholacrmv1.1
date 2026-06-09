import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const projects = [
  {
    id: 1,
    slug: 'real-estate-pipeline',
    title: 'Real Estate Sales Pipeline',
    metric: 'Increased sales by 47%',
    description: 'Complete sales pipeline management for real estate firms with automated lead tracking and deal progression.',
    imgKey: 'real estate dashboard on laptop'
  },
  {
    id: 2,
    slug: 'property-management',
    title: 'Property Management Operations',
    metric: 'Manages 850+ properties',
    description: 'Streamlined property management operations with tenant tracking, maintenance scheduling, and financial reporting.',
    imgKey: 'property management interface on tablet'
  },
  {
    id: 3,
    slug: 'multi-industry-tracking',
    title: 'Multi-Industry Client Tracking',
    metric: 'Reduced admin time by 62%',
    description: 'Customizable client relationship management adapted for healthcare, consulting, and professional services sectors.',
    imgKey: 'business analytics dashboard on phone'
  }
];

const Portfolio = () => {
  const navigate = useNavigate();

  const handleProjectClick = (slug) => {
    navigate(`/project/${slug}`);
  };

  return (
    <section id="portfolio" className="py-24 bg-[#0C0D0D]">
      <div className="container mx-auto px-6">
        <div className="flex flex-wrap justify-between items-end gap-8 mb-16">
          <div className="w-full lg:w-1/2">
            <div className="inline-block px-4 py-1.5 border border-white/20 rounded-full text-sm mb-4 uppercase">
              Industry Solutions
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight uppercase">
              Real results across <span className="text-accent-purple">multiple industries</span>
            </h2>
          </div>
          <div className="w-full lg:w-1/3">
            <p className="text-lg text-gray-400">
              Discover how Be Souhola empowers businesses across real estate, property management, and professional services to achieve measurable growth and operational excellence.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div
            className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer"
            onClick={() => handleProjectClick('real-estate-pipeline')}
          >
            <img
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              alt="Real estate CRM dashboard showing sales pipeline and property listings on a laptop"
              src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/tech-daily-lkyv7faumza-unsplash-2-FOBCl.jpg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
            <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-accent-purple text-sm font-bold mb-1 uppercase">Increased sales by 47%</div>
                  <h3 className="text-xl font-bold text-white mb-1">Real Estate Sales Pipeline</h3>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-full">
                  <ArrowUpRight className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div
            className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer"
            onClick={() => handleProjectClick('property-management')}
          >
            <img
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              alt="Property management dashboard displaying tenant information and maintenance schedules on a tablet"
              src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/gemini_generated_image_n6u5epn6u5epn6u5-5abrf-2-W2Hon.jpg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
            <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-accent-purple text-sm font-bold mb-1 uppercase">Manages 850+ properties</div>
                  <h3 className="text-xl font-bold text-white mb-1">Property Management Operations</h3>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-full">
                  <ArrowUpRight className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div
            className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer"
            onClick={() => handleProjectClick('multi-industry-tracking')}
          >
            <img
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              alt="Business analytics dashboard showing client tracking metrics and performance data on a smartphone"
              src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/sumup-vsyr_mbh7q4-unsplash-2-Hxitr.jpg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
            <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-accent-purple text-sm font-bold mb-1 uppercase">Reduced admin time by 62%</div>
                  <h3 className="text-xl font-bold text-white mb-1">Multi-Industry Client Tracking</h3>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-full">
                  <ArrowUpRight className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Portfolio;