import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const Portfolio = () => {
  const navigate = useNavigate();
  const { portfolio } = useWebsiteContent();
  const cards = Array.isArray(portfolio?.cards) ? portfolio.cards : [];

  const handleProjectClick = (slug) => {
    navigate(`/project/${slug}`);
  };

  return (
    <section id="portfolio" className="py-24 bg-[#0C0D0D]">
      <div className="container mx-auto px-6">
        <div className="flex flex-wrap justify-between items-end gap-8 mb-16">
          <div className="w-full lg:w-1/2">
            <div className="inline-block px-4 py-1.5 border border-white/20 rounded-full text-sm mb-4 uppercase">
              {portfolio?.eyebrow}
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight uppercase">
              {portfolio?.title} <span className="text-accent-purple">{portfolio?.title_accent}</span>
            </h2>
          </div>
          <div className="w-full lg:w-1/3">
            <p className="text-lg text-gray-400">
              {portfolio?.description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {cards.map((card, index) => (
            <div
              key={card.slug || index}
              className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer"
              onClick={() => handleProjectClick(card.slug)}
            >
              <img
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                alt={card.image_alt}
                src={card.image_url}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
              <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-accent-purple text-sm font-bold mb-1 uppercase">{card.metric}</div>
                    <h3 className="text-xl font-bold text-white mb-1">{card.title}</h3>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm p-3 rounded-full">
                    <ArrowUpRight className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Portfolio;
