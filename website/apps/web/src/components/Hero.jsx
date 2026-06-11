import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, CheckCircle2, Clock3, BarChart3, Zap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AnimatedHeroBackground from '@/components/AnimatedHeroBackground';
import LeadForm from '@/components/LeadForm';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { trackCtaClick } from '@/lib/analytics';

const statsIcons = [Users, Clock3, BarChart3, Zap];

const Hero = () => {
  const { hero, leadServiceOptions } = useWebsiteContent();
  const heroStats = Array.isArray(hero.stats) && hero.stats.length > 0 ? hero.stats : [];
  const heroBenefitPoints =
    Array.isArray(hero.benefit_points) && hero.benefit_points.length > 0
      ? hero.benefit_points
      : [];
  const heroFormPanelPoints =
    Array.isArray(hero.form_panel_points) && hero.form_panel_points.length > 0
      ? hero.form_panel_points
      : [];

  const handleExploreFeaturesClick = () => {
    const servicesSection = document.getElementById('services');
    if (servicesSection) {
      servicesSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative flex min-h-screen items-start justify-center overflow-visible pt-20 sm:pt-24 lg:pt-28 xl:pt-32">
      <AnimatedHeroBackground />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_32%),linear-gradient(135deg,rgba(7,8,13,0.84),rgba(7,8,13,0.97))]" />

      <div className="relative z-10 mx-auto w-full max-w-[1450px] px-4 py-10 sm:px-5 sm:py-12 lg:px-6 lg:py-14 xl:px-7 xl:py-16 2xl:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.88fr)] lg:items-start lg:gap-8 xl:gap-10 2xl:gap-12">
          <div className="max-w-2xl lg:max-w-[38rem] lg:pt-2 xl:pt-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent-purple/20 bg-accent-purple/10 px-3.5 py-1.5 shadow-[0_10px_40px_rgba(147,114,255,0.14)]"
            >
              <Sparkles className="w-4 h-4 text-accent-purple" />
              <span className="text-[0.72rem] text-[#c5b8ff] uppercase tracking-[0.28em]">
                {hero.badge}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mb-4 max-w-[9.5ch] text-[clamp(2.55rem,11vw,3.9rem)] font-bold uppercase leading-[0.98] text-white sm:max-w-[10ch] sm:text-[clamp(3rem,9vw,4.2rem)] lg:max-w-4xl lg:text-[3.45rem] xl:text-[3.8rem] 2xl:text-[4.15rem]"
            >
              <span className="text-gradient">{hero.headline}</span>
              {hero.headline_accent ? (
                <span className="block text-white">{hero.headline_accent}</span>
              ) : null}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mb-6 max-w-xl text-[1rem] leading-[1.55] text-gray-300 md:text-[1.05rem]"
            >
              {hero.subtitle}
            </motion.p>

            {heroStats.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.48 }}
              className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
                {heroStats.map(({ value, label }, index) => {
                  const Icon = statsIcons[index % statsIcons.length];
                  return (
                    <div
                      key={`${label}-${value}-${index}`}
                      className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3.5 backdrop-blur-md"
                    >
                      <div className="flex items-center gap-2 text-accent-purple">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="mt-2.5 text-[1.7rem] font-bold text-white">{value}</div>
                      <div className="mt-1 text-sm text-gray-400">{label}</div>
                    </div>
                  );
                })}
              </motion.div>
            ) : null}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex flex-col gap-4 sm:flex-row"
            >
              <Button
                onClick={() => {
                  trackCtaClick(hero.secondary_cta, { meta: { location: 'hero' } });
                  handleExploreFeaturesClick();
                }}
                size="lg"
                variant="outline"
                className="rounded-full border-2 border-accent-purple/40 px-6 py-4 text-base text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:bg-accent-purple/10"
              >
                {hero.secondary_cta}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.68 }}
              className="mt-7 grid gap-3 sm:grid-cols-3"
            >
              {heroBenefitPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-200"
                >
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-300" />
                  <span>{point}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            id="hero-lead-form"
            className="lg:sticky lg:top-24 xl:top-28"
          >
            <div className="hero-form-shell rounded-[1.75rem] border border-white/12 bg-white/[0.06] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.4)] backdrop-blur-2xl md:p-5 xl:p-6">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {hero.form_badge || hero.primary_cta}
                  </div>
                  <h2 className="mt-3 text-[1.9rem] font-bold uppercase leading-[1.05] text-white md:text-[1.7rem]">{hero.form_title}</h2>
                  <p className="mt-2 max-w-md text-[0.98rem] text-gray-300">{hero.form_subtitle}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-sm text-gray-200 xl:max-w-[235px]">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                    {hero.form_side_title || 'Why teams choose us'}
                  </div>
                  <div className="mt-3 space-y-2">
                    {heroFormPanelPoints.map((point) => (
                      <div key={point} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-accent-purple" /> {point}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <LeadForm
                formName="Hero Lead Form"
                compact
                serviceOptions={leadServiceOptions}
                nameLabel={hero.name_label}
                namePlaceholder={hero.name_placeholder}
                phoneLabel={hero.phone_label}
                phonePlaceholder={hero.phone_placeholder}
                emailLabel={hero.email_label}
                emailPlaceholder={hero.email_placeholder}
                serviceLabel={hero.service_label}
                servicePlaceholder={hero.service_placeholder}
                messageLabel={hero.message_label}
                messagePlaceholder={hero.message_placeholder}
                privacyNote={hero.privacy_note}
                submitLabel={hero.form_button_text || hero.primary_cta}
                successTitle={hero.success_title}
                successMessage={hero.success_message}
                successResetText={hero.success_reset_text}
              />
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 transform xl:block"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-6 h-10 border-2 border-accent-purple/40 rounded-full flex items-start justify-center p-2"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 bg-accent-purple rounded-full"
          />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default Hero;
