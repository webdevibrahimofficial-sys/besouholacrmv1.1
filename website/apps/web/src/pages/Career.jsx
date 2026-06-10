import React from 'react';
import { Helmet } from 'react-helmet';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Briefcase, Clock3, MapPin, Sparkles, Users2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import CareerApplicationForm from '@/components/CareerApplicationForm';
import { trackCtaClick } from '@/lib/analytics';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const Career = () => {
  const {
    careersPage,
    careerHighlights,
    careerValues,
    careerBenefits,
    careerRoles,
  } = useWebsiteContent();
  const [activeFilter, setActiveFilter] = React.useState('All');
  const [isGeneralApplicationOpen, setIsGeneralApplicationOpen] = React.useState(false);

  const handleViewRoles = () => {
    document.getElementById('open-roles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleApply = (roleTitle) => {
    trackCtaClick('Apply Now', { meta: { location: 'career', role: roleTitle } });
    setIsGeneralApplicationOpen(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        document
          .getElementById('general-career-application')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 140);
    });
  };

  const filteredRoles =
    activeFilter === 'All'
      ? careerRoles
      : careerRoles.filter((role) => role.department === activeFilter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.45 }}
    >
      <Helmet>
        <title>Careers at Be Souhola CRM</title>
        <meta
          name="description"
          content="Explore career opportunities at Be Souhola CRM and help build a smarter growth platform for ambitious teams."
        />
      </Helmet>

      <section className="relative overflow-hidden bg-[#0C0D0D] px-4 pb-20 pt-24 text-white sm:px-6 sm:pt-28 lg:px-8 lg:pb-24 lg:pt-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(86,186,255,0.12),transparent_26%)]" />
        <div className="relative mx-auto max-w-[1380px]">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_420px] lg:items-start xl:gap-14">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent-purple/20 bg-accent-purple/10 px-4 py-2 text-sm uppercase tracking-[0.22em] text-[#c5b8ff]">
                  <Sparkles className="h-4 w-4 text-accent-purple" />
                  {careersPage.badge}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm uppercase tracking-[0.22em] text-emerald-200">
                  {careersPage.hiringBadge}
                </div>
              </div>

              <h1 className="mt-6 max-w-[10.5ch] text-[clamp(2.65rem,8vw,4.65rem)] font-bold leading-[0.97] text-white">
                {careersPage.title}
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-300 md:text-[1.08rem]">
                {careersPage.subtitle}
              </p>

              <p className="mt-4 text-sm uppercase tracking-[0.18em] text-white/55">
                {careersPage.availabilityNote}
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button
                  className="group rounded-full bg-accent-purple px-7 py-6 text-base text-white shadow-[0_12px_30px_rgba(147,114,255,0.34)] hover:bg-accent-purple/90"
                  onClick={handleViewRoles}
                >
                  {careersPage.primaryCta}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
                <Button
                  variant="outline"
                  className="group rounded-full border-white/15 bg-white/5 px-7 py-6 text-base text-white hover:bg-white/10"
                  onClick={() => handleApply('General Application')}
                >
                  {careersPage.secondaryCta}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {careerHighlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 backdrop-blur-md"
                  >
                    <div className="text-base font-semibold text-white">{item.title}</div>
                    <div className="mt-2 text-sm text-gray-300">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl lg:mt-4">
              <div className="flex items-center gap-3 text-accent-purple">
                <Users2 className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-[0.2em] text-white/70">
                  {careersPage.sidebarBadge}
                </span>
              </div>
              <div className="mt-5 space-y-4">
                {careersPage.sidebarCards.map((card) => (
                  <div key={card.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-3xl font-bold text-white">{card.title}</div>
                    <div className="mt-1 text-sm text-gray-400">{card.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="open-roles" className="mt-16 scroll-mt-28 lg:mt-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-white/45">{careersPage.rolesTitle}</p>
                <h2 className="mt-3 text-3xl font-bold uppercase text-white md:text-4xl">
                  {careersPage.rolesHeading}
                </h2>
              </div>
              <p className="max-w-xl text-gray-400">
                {careersPage.rolesSubtitle}
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              {careersPage.roleFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    activeFilter === filter
                      ? 'border-accent-purple bg-accent-purple text-white'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {filteredRoles.map((opening, index) => (
                <motion.div
                  key={opening.slug}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.08 * index }}
                  className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_16px_60px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-purple/12 text-accent-purple">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/70">
                      {opening.employmentType}
                    </span>
                  </div>

                  <h3 className="mt-6 text-2xl font-semibold text-white">{opening.title}</h3>
                  <div className="mt-2 text-sm uppercase tracking-[0.16em] text-accent-purple/90">
                    {opening.department}
                  </div>
                  <p className="mt-3 min-h-[72px] text-gray-400">{opening.summary}</p>

                  <div className="mt-5 grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-accent-purple" />
                      {opening.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-accent-purple" />
                      {opening.workType}
                    </div>
                  </div>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      className="flex-1 rounded-full bg-white text-black hover:bg-white/90"
                    >
                      <Link to={`/career/${opening.slug}`}>View Details</Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="group flex-1 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => handleApply(opening.title)}
                    >
                      Quick Apply
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-16 rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-6 xl:mt-20 xl:p-7">
            <p className="text-sm uppercase tracking-[0.22em] text-white/45">{careersPage.highlightsTitle}</p>
            <h2 className="mt-3 text-3xl font-bold uppercase text-white md:text-4xl">
              {careersPage.highlightsHeading}
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {careerHighlights.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5">
                  <div className="text-lg font-semibold text-white">{item.title}</div>
                  <div className="mt-2 text-sm leading-6 text-gray-300">{item.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:mt-20 xl:gap-8">
            <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-6 xl:p-7">
              <p className="text-sm uppercase tracking-[0.22em] text-white/45">{careersPage.valuesTitle}</p>
              <h2 className="mt-3 text-3xl font-bold uppercase text-white md:text-4xl">
                {careersPage.valuesHeading}
              </h2>
              <p className="mt-4 max-w-2xl text-gray-400">{careersPage.valuesSubtitle}</p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {careerValues.map((value) => (
                  <div
                    key={value.title}
                    className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5"
                  >
                    <div className="text-lg font-semibold text-white">{value.title}</div>
                    <div className="mt-2 text-sm leading-6 text-gray-300">{value.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-6 xl:p-7">
              <p className="text-sm uppercase tracking-[0.22em] text-white/45">{careersPage.benefitsTitle}</p>
              <h2 className="mt-3 text-3xl font-bold uppercase text-white md:text-4xl">
                {careersPage.benefitsHeading}
              </h2>
              <div className="mt-8 space-y-4">
                {careerBenefits.map((benefit) => (
                  <div
                    key={benefit.title}
                    className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5"
                  >
                    <div className="text-lg font-semibold text-white">{benefit.title}</div>
                    <div className="mt-2 text-sm leading-6 text-gray-300">{benefit.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-16 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(135deg,rgba(147,114,255,0.14),rgba(255,255,255,0.05))] p-6 xl:mt-20 xl:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-white/45">{careersPage.generalApplicationBadge}</p>
                <h2 className="mt-3 text-3xl font-bold uppercase text-white md:text-4xl">
                  {careersPage.generalApplicationHeading}
                </h2>
                <p className="mt-4 max-w-2xl text-gray-300">
                  {careersPage.generalApplicationSubtitle}
                </p>
              </div>
              <Button
                className="group rounded-full bg-accent-purple px-7 py-6 text-base text-white shadow-[0_12px_30px_rgba(147,114,255,0.34)] hover:bg-accent-purple/90"
                onClick={() => handleApply('General Application')}
              >
                {careersPage.generalApplicationButtonText}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isGeneralApplicationOpen ? (
              <motion.div
                id="general-career-application"
                initial={{ opacity: 0, y: 30, scale: 0.985, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 18, scale: 0.99, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mt-8 scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.25)] md:p-5 xl:mt-10"
              >
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.35 }}
                >
                  <CareerApplicationForm
                    formName="General Career Application"
                    headline={careersPage.generalFormHeadline}
                    subtitle={careersPage.generalFormSubtitle}
                    compact
                  />
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </section>
    </motion.div>
  );
};

export default Career;
