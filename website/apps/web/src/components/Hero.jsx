import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  Clock3,
  BarChart3,
  Zap,
  Users,
  PhoneCall,
  Copy,
  Trophy,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AnimatedHeroBackground from '@/components/AnimatedHeroBackground';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import DemoRequestModal from '@/components/DemoRequestModal';

const PIPELINE_STAGES = [
  {
    label: 'TOTAL LEADS',
    value: '248',
    cardStyle: {
      background: 'linear-gradient(180deg, #d8e7fb 0%, #cfe0f7 100%)',
      border: '1.5px solid #4d9cff',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 24px rgba(77,156,255,0.14)',
    },
    iconStyle: {
      background: 'linear-gradient(180deg, #4b95f8 0%, #2f7bf0 100%)',
      boxShadow: '0 6px 14px rgba(47,123,240,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    },
    icon: Users,
  },
  {
    label: 'NEW',
    value: '86',
    cardStyle: {
      background: 'linear-gradient(180deg, #dcf5de 0%, #d0f0d4 100%)',
      border: '1.5px solid #18d970',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 24px rgba(24,217,112,0.14)',
    },
    iconStyle: {
      background: 'linear-gradient(180deg, #35d97d 0%, #16bc5f 100%)',
      boxShadow: '0 6px 14px rgba(22,188,95,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    },
    icon: Sparkles,
  },
  {
    label: 'DUPLICATE',
    value: '32',
    cardStyle: {
      background: 'linear-gradient(180deg, #ffe4e4 0%, #ffdada 100%)',
      border: '1.5px solid #ff6767',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 24px rgba(255,103,103,0.14)',
    },
    iconStyle: {
      background: 'linear-gradient(180deg, #ff5757 0%, #f23737 100%)',
      boxShadow: '0 6px 14px rgba(242,55,55,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    },
    icon: Copy,
  },
  {
    label: 'PENDING',
    value: '98',
    cardStyle: {
      background: 'linear-gradient(180deg, #fff8cf 0%, #fff3ba 100%)',
      border: '1.5px solid #ffc61c',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 24px rgba(255,198,28,0.14)',
    },
    iconStyle: {
      background: 'linear-gradient(180deg, #efb925 0%, #dca11a 100%)',
      boxShadow: '0 6px 14px rgba(220,161,26,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    },
    icon: Clock3,
  },
  {
    label: 'COLD CALLS',
    value: '32',
    cardStyle: {
      background: 'linear-gradient(180deg, #ffedd8 0%, #ffe7cd 100%)',
      border: '1.5px solid #ff9728',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 24px rgba(255,151,40,0.14)',
    },
    iconStyle: {
      background: 'linear-gradient(180deg, #ff7d2f 0%, #ff6122 100%)',
      boxShadow: '0 6px 14px rgba(255,97,34,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
    },
    icon: PhoneCall,
  },
];

const RANKING = [
  { name: 'Ahmed Mohamed', actions: 128 },
  { name: 'Mona Adel', actions: 96 },
  { name: 'Omar Mostafa', actions: 74 },
];

const OUTER_STATS = [
  { icon: Users, value: '500+', label: 'Businesses trust us' },
  { icon: Zap, value: '24h', label: 'Avg response time' },
  { icon: BarChart3, value: '38%', label: 'Faster deal closing' },
];

const DashboardPanel = () => (
  <div
    className="hero-form-shell rounded-[1.75rem] border border-white/10 bg-[#0a0b10]/82 p-3.5 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
    style={{ isolation: 'isolate' }}
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-2.5 w-2.5 rounded-sm bg-accent-purple/${90 - i * 18}`} />
          ))}
        </div>
        <span className="text-[0.92rem] font-semibold text-white">Dashboard</span>
      </div>
      <button className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.72rem] text-gray-300 transition-colors hover:bg-white/10">
        <Play className="h-3 w-3" />
        See how it works
      </button>
    </div>

    <div className="mb-3">
      <p className="mb-2 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-gray-500">
        Pipeline stages
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {PIPELINE_STAGES.map(({ label, value, cardStyle, iconStyle, icon: Icon }) => (
          <div
            key={label}
            className="rounded-[1.15rem] p-2.5"
            style={{ colorScheme: 'light', isolation: 'isolate', ...cardStyle }}
          >
            <div
              className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-[0.7rem] text-white"
              style={iconStyle}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
            </div>
            <div
              style={{
                fontSize: '0.52rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#374151',
              }}
            >
              {label}
            </div>
            <div
              style={{
                marginTop: '0.35rem',
                fontSize: '1.45rem',
                fontWeight: 700,
                lineHeight: 1,
                color: '#111827',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-white/8 bg-white/4 p-3">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Clock3 className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Delay Leads</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[2rem] font-bold leading-none text-accent-purple">18</div>
            <div className="mt-1 text-[0.72rem] text-gray-400">Leads need follow-up</div>
            <div className="text-[0.64rem] text-gray-500">Take action to close more deals</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-purple/15">
            <Users className="h-4 w-4 text-accent-purple" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/4 p-3">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Trophy className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Ranking</span>
        </div>
        <div className="mt-2 space-y-2">
          {RANKING.map(({ name, actions }, index) => (
            <div key={name} className="flex items-center gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-purple/20 text-[0.6rem] font-bold text-accent-purple">
                {index + 1}
              </span>
              <span className="flex-1 truncate text-[0.76rem] font-medium text-gray-200">{name}</span>
              <div className="text-right">
                <div className="text-[0.82rem] font-bold text-accent-purple">{actions}</div>
                <div className="text-[0.55rem] text-gray-500">Actions</div>
              </div>
            </div>
          ))}
        </div>
        <button className="mt-2 text-[0.64rem] text-accent-purple hover:underline">
          View full ranking →
        </button>
      </div>
    </div>
  </div>
);

const Hero = () => {
  const { hero } = useWebsiteContent();

  const handleExploreFeaturesClick = () => {
    const servicesSection = document.getElementById('services');
    if (servicesSection) {
      servicesSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative flex min-h-screen items-start justify-center overflow-visible pt-[3.85rem] sm:pt-[4.1rem]">
      <AnimatedHeroBackground />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_32%),linear-gradient(135deg,rgba(7,8,13,0.84),rgba(7,8,13,0.97))]" />

      <div className="relative z-10 mx-auto w-full max-w-[1450px] px-4 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10 xl:px-7 xl:py-12 2xl:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.85fr)] lg:items-start lg:gap-8 xl:gap-10 2xl:gap-12">
          <div className="max-w-2xl lg:max-w-[38rem] lg:pt-2 xl:pt-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent-purple/20 bg-accent-purple/10 px-3.5 py-1.5 shadow-[0_10px_40px_rgba(147,114,255,0.14)]"
            >
              <Sparkles className="h-4 w-4 text-accent-purple" />
              <span className="text-[0.72rem] uppercase tracking-[0.28em] text-[#c5b8ff]">
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
              {hero.headline_accent ? <span className="block text-white">{hero.headline_accent}</span> : null}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.35 }}
              className="mb-7 max-w-xl text-[1rem] leading-[1.6] text-gray-300 md:text-[1.05rem]"
            >
              Capture leads, automate follow-ups, manage your team, and close deals faster with one intelligent CRM.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <DemoRequestModal
                location="hero"
                formName="Hero Demo Modal"
                title={hero.form_title || 'Book Your Free CRM Demo'}
                description={hero.form_subtitle || "Tell us about your business and we'll contact you within 24 hours."}
                trigger={
                  <Button
                    size="lg"
                    className="rounded-full bg-accent-purple px-8 py-4 text-base font-semibold text-white shadow-[0_14px_38px_rgba(147,114,255,0.35)] hover:bg-accent-purple/90"
                  >
                    {hero.primary_cta || 'Book Free Demo'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                }
              />

              <Button
                onClick={handleExploreFeaturesClick}
                size="lg"
                variant="outline"
                className="rounded-full border-2 border-accent-purple/40 px-6 py-4 text-base text-white hover:bg-accent-purple/10"
              >
                {hero.secondary_cta || 'Explore Features'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>

          </div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            id="hero-demo-panel"
            className="lg:sticky lg:top-24 lg:ml-auto lg:max-w-[760px] xl:top-28"
          >
            <div className="space-y-4">
              <div className="origin-top-right scale-[0.9] lg:-mb-12">
                <DashboardPanel />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.65 }}
                className="grid gap-3 sm:grid-cols-3"
              >
                {OUTER_STATS.map(({ icon: Icon, value, label }) => (
                  <div
                    key={value}
                    className="flex items-center gap-3 rounded-[2rem] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm"
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-accent-purple/15">
                      <Icon className="h-5 w-5 text-accent-purple" />
                    </div>
                    <div>
                      <div className="text-[1.05rem] font-bold text-white">{value}</div>
                      <div className="text-[0.82rem] text-gray-400">{label}</div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
