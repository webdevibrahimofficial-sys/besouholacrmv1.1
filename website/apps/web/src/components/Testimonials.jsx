import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const Testimonials = () => {
  const scrollContainerRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(1);
  const { testimonials: testimonialsSection } = useWebsiteContent();
  const testimonials = Array.isArray(testimonialsSection?.testimonials)
    ? testimonialsSection.testimonials
    : [];

  useEffect(() => {
    const updateItemsPerPage = () => {
      if (window.innerWidth >= 768) {
        setItemsPerPage(2);
      } else {
        setItemsPerPage(1);
      }
    };
    updateItemsPerPage();
    window.addEventListener('resize', updateItemsPerPage);
    return () => window.removeEventListener('resize', updateItemsPerPage);
  }, []);

  const canScrollLeft = currentIndex > 0;
  const canScrollRight = currentIndex < testimonials.length - itemsPerPage;

  const scroll = (direction) => {
    let newIndex = currentIndex;
    if (direction === 'left' && canScrollLeft) {
      newIndex = Math.max(0, currentIndex - 1);
    } else if (direction === 'right' && canScrollRight) {
      newIndex = Math.min(testimonials.length - itemsPerPage, currentIndex + 1);
    }

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      if (scrollContainerRef.current) {
        const card = scrollContainerRef.current.children[newIndex];
        if (card) {
          scrollContainerRef.current.scrollTo({
            left: card.offsetLeft,
            behavior: 'smooth'
          });
        }
      }
    }
  };

  return (
    <section id="testimonials" className="py-24 bg-[#0C0D0D] overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="flex justify-between items-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight uppercase max-w-lg">
            {testimonialsSection?.title}{' '}
            <span className="text-accent-purple">{testimonialsSection?.title_accent}</span>{' '}
            {testimonialsSection?.title_suffix}
          </h2>
          <div className="hidden md:flex gap-4">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="p-3 rounded-full bg-[#1E1E2A] border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Scroll left"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="p-3 rounded-full bg-[#1E1E2A] border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Scroll right"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex flex-nowrap gap-8 pb-8 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        >
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.id ?? `${testimonial.name || 'testimonial'}-${index}`}
              className="flex-shrink-0 w-[calc(100%-48px)] md:w-[calc(50%-16px)] snap-start"
            >
              <div className="bg-[#1E1E2A] p-8 rounded-2xl h-full flex flex-col border border-white/10">
                <div className="flex items-center mb-6">
                  <img
                    className="w-12 h-12 rounded-full mr-4 object-cover"
                    alt={testimonial.name}
                    src={testimonial.avatar}
                  />
                  <div>
                    <p className="font-bold text-white">{testimonial.name}</p>
                    <p className="text-sm text-gray-400">{testimonial.role}</p>
                  </div>
                </div>
                <p className="text-gray-300 leading-relaxed">"{testimonial.content}"</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end md:hidden">
          <div className="flex gap-4">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="p-3 rounded-full bg-[#1E1E2A] border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              aria-label="Scroll left"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="p-3 rounded-full bg-[#1E1E2A] border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              aria-label="Scroll right"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
