import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import Stats from '@/components/Stats';
import SectionAnimator from '@/components/SectionAnimator';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

// Mock data for projects
const projectData = {
  'social-media-app': {
    title: 'Next-Gen Banking UI',
    category: 'Web & App Design',
    description: 'A revolutionary banking interface designed for simplicity, security, and a seamless user experience. It empowers users with intuitive financial management tools, all within a stunning, modern design.',
    challenge: 'The primary challenge was to demystify complex banking operations. We needed to create a dashboard that was both powerful for seasoned users and approachable for beginners, all while ensuring bank-grade security and flawless performance across all devices.',
    solution: 'We developed a modular, widget-based dashboard allowing for deep personalization. By leveraging cutting-edge data visualization, we transformed complex transaction histories and investment data into beautiful, interactive charts. The implementation of biometric authentication and end-to-end encryption guarantees user data is always secure.',
    images: {
      hero: {
        alt: 'Main dashboard of a modern banking application',
        key: 'banking application dashboard view'
      },
      gallery: [{
        alt: 'Detailed view of a transaction history page',
        key: 'banking app transaction history detail'
      }, {
        alt: 'Analytics dashboard showing spending habits',
        key: 'banking app spending analytics'
      }, {
        alt: 'Close-up of banking app UI elements',
        key: 'banking app ui elements close up'
      }],
      gallery2: [{
        alt: 'User setting up a new payment on the banking app',
        key: 'user making payment on banking app'
      }, {
        alt: 'Security features page on the banking app',
        key: 'banking app security features'
      }]
    },
    stats: [{
      value: 50,
      suffix: '%',
      label: 'Faster Onboarding',
      description: 'Streamlined user registration process.'
    }, {
      value: 2,
      suffix: 'M+',
      label: 'Transactions Processed',
      description: 'Securely handled within the first year.'
    }, {
      value: 4.9,
      suffix: '/5',
      label: 'User Rating',
      description: 'Overwhelmingly positive feedback on app stores.'
    }, {
      value: 99.9,
      suffix: '%',
      label: 'Service Uptime',
      description: 'Uninterrupted access to banking services.'
    }]
  },
  'fintech-dashboard': {
    title: 'Fintech Dashboard',
    category: 'Web & App Design',
    description: 'A comprehensive fintech dashboard designed for clarity and efficiency. It provides users with a detailed overview of their finances, payment histories, and investment portfolios, all wrapped in a secure and user-friendly design.',
    challenge: 'The main goal was to simplify complex financial data into an easily digestible format without sacrificing functionality. Security was paramount, requiring multi-layered protection and compliance with financial regulations while maintaining a fast, responsive user interface.',
    solution: 'We designed a modular dashboard with customizable widgets, allowing users to prioritize the information that matters most to them. By integrating advanced data visualization libraries, we transformed dense datasets into interactive charts and graphs. End-to-end encryption and biometric authentication were implemented to ensure top-tier security.',
    images: {
      hero: {
        alt: 'Main dashboard of a fintech application',
        key: 'fintech application dashboard view'
      },
      gallery: [{
        alt: 'A user analyzing stock market data on the fintech platform',
        key: 'user analyzing stock data on fintech platform'
      }, {
        alt: 'Mobile version of the fintech app showing a transaction summary',
        key: 'fintech app mobile transaction summary'
      }, {
        alt: 'Close-up on a pie chart showing portfolio distribution',
        key: 'fintech app portfolio pie chart'
      }],
      gallery2: [{
        alt: 'Card management screen on the fintech app',
        key: 'fintech app card management screen'
      }, {
        alt: 'Security settings page on the fintech dashboard',
        key: 'fintech dashboard security settings page'
      }]
    },
    stats: [{
      value: 40,
      suffix: '%',
      label: 'Faster Transactions',
      description: 'Optimized payment processing flows.'
    }, {
      value: 99.9,
      suffix: '%',
      label: 'Uptime',
      description: 'Ensuring reliable access to financial data.'
    }, {
      value: 500,
      suffix: 'K+',
      label: 'Active Users',
      description: 'Growing user base relying on the platform daily.'
    }, {
      value: 90,
      suffix: '%',
      label: 'Positive Feedback',
      description: 'Users praising the intuitive and clean UI.'
    }]
  },
  'digital-marketing-agency-site': {
    title: 'Digital Marketing Agency Site',
    category: 'Web Development',
    description: 'A cutting-edge website for a digital marketing agency, designed to convert visitors into leads. The site showcases their services, portfolio, and expertise through a dynamic and engaging user experience.',
    challenge: 'The challenge was to stand out in a crowded market. The website needed to be visually stunning, incredibly fast, and optimized for search engines to rank high for competitive keywords, all while clearly communicating the agency\'s value proposition.',
    solution: 'We built a statically generated site for unparalleled performance and SEO. Interactive case studies and a dynamic service calculator were developed to engage users and provide immediate value. A/B testing on call-to-action buttons and headlines led to a significant increase in conversion rates.',
    images: {
      hero: {
        alt: 'Homepage of a digital marketing agency website',
        key: 'digital marketing agency website homepage'
      },
      gallery: [{
        alt: 'Portfolio section of the marketing agency site',
        key: 'marketing agency portfolio section'
      }, {
        alt: 'Contact form and map on the marketing agency site',
        key: 'marketing agency contact form'
      }, {
        alt: 'Team page of the marketing agency',
        key: 'marketing agency team page'
      }],
      gallery2: [{
        alt: 'Blog section of the marketing agency website',
        key: 'marketing agency blog section'
      }, {
        alt: 'Services page of the marketing agency',
        key: 'marketing agency services page'
      }]
    },
    stats: [{
      value: 60,
      suffix: '%',
      label: 'Lead Increase',
      description: 'Increase in qualified leads within the first three months.'
    }, {
      value: 1.2,
      suffix: 's',
      label: 'Load Time',
      description: 'Achieving an exceptional page load speed.'
    }, {
      value: 20,
      suffix: '%',
      label: 'Bounce Rate Drop',
      description: 'Reduced bounce rate through engaging content.'
    }, {
      value: 1,
      suffix: '#',
      label: 'SERP Ranking',
      description: 'Top ranking for primary target keywords.'
    }]
  }
};

const pageVariants = {
  initial: {
    opacity: 0
  },
  in: {
    opacity: 1
  },
  out: {
    opacity: 0
  }
};

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.8
};

const Project = () => {
  const {
    projectId
  } = useParams();
  const project = projectData[projectId] || projectData['fintech-dashboard']; // Fallback

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [projectId]);

  return <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="bg-[#0C0D0D] text-white">
      <Helmet>
        <title>{project.title} - Project Showcase</title>
        <meta name="description" content={`Details of the ${project.title} project, showcasing our creative solutions and results.`} />
      </Helmet>

      <main>
        {/* Top Section */}
        <SectionAnimator>
          <header className="pt-48 pb-16"> {/* Increased padding-top */}
            <div className="container mx-auto px-6 text-center max-w-4xl">
              <h1 className="text-4xl md:text-6xl font-bold uppercase mb-4">{project.title}</h1>
              <p className="text-lg md:text-xl text-gray-400">{project.description}</p>
            </div>
          </header>
        </SectionAnimator>
        
        {/* Hero Image */}
        <SectionAnimator>
            <div className="container mx-auto px-6 mb-16">
                 <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-accent-purple/10">
                    <img className="w-full h-full object-cover" alt={project.images.hero.alt} src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/gemini_generated_image_n6u5epn6u5epn6u5-5ABrF.png" />
                 </div>
            </div>
        </SectionAnimator>

        {/* Gallery - now starts with two images */}
        <SectionAnimator>
            <div className="container mx-auto px-6 mb-16">
                <div className="grid grid-cols-1 gap-8">
                    {/* Two images */}
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="aspect-square rounded-2xl overflow-hidden">
                           <img className="w-full h-full object-cover" alt={project.images.gallery[1].alt} src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/gemini_generated_image_mxgp1bmxgp1bmxgp-IDwMQ.png" />
                        </div>
                        <div className="aspect-square rounded-2xl overflow-hidden">
                            <img className="w-full h-full object-cover" alt={project.images.gallery[2].alt} src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/gemini_generated_image_mxgp1bmxgp1bmxgp-1-RqwfI.png" />
                        </div>
                    </div>
                </div>
            </div>
        </SectionAnimator>
        
        {/* Text Section */}
        <SectionAnimator>
            <section className="py-16">
                <div className="container mx-auto px-6 grid md:grid-cols-2 gap-16 items-start">
                    <div>
                        <h2 className="text-3xl md:text-4xl font-bold mb-6">The Challenge</h2>
                        <p className="text-lg text-gray-400">{project.challenge}</p>
                    </div>
                     <div>
                        <h2 className="text-3xl md:text-4xl font-bold mb-6">The Solution</h2>
                        <p className="text-lg text-gray-400">{project.solution}</p>
                    </div>
                </div>
            </section>
        </SectionAnimator>
        
        {/* Second Gallery - changed to single image */}
        <SectionAnimator>
            <div className="container mx-auto px-6 mb-16">
                <div className="aspect-video rounded-2xl overflow-hidden">
                    <img className="w-full h-full object-cover" alt={project.images.gallery2[0].alt} src="https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/professional-exchange-BmQpX.png" />
                </div>
            </div>
        </SectionAnimator>

        {/* Stats Section */}
        <Stats customStats={project.stats} />

        {/* Work Together CTA */}
        <SectionAnimator>
            <section className="py-24 text-center">
                <div className="container mx-auto px-6">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Work Together?</h2>
                    <p className="text-lg text-gray-400 mb-8">Let's discuss your next big idea and how we can bring it to life.</p>
                     <Button asChild size="lg" className="bg-accent-purple text-white hover:bg-accent-purple/90 group rounded-full text-lg py-7 px-10">
                        <Link to="/contact#lead-form">
                            Let's Talk <ArrowRight className="ml-2 h-5 w-5 transform transition-transform duration-300 group-hover:translate-x-1" />
                        </Link>
                    </Button>
                </div>
            </section>
        </SectionAnimator>

      </main>
    </motion.div>;
};

export default Project;