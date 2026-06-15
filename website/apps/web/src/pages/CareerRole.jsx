import React from 'react';
import { Helmet } from 'react-helmet';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Briefcase, Clock3, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import CareerApplicationForm from '@/components/CareerApplicationForm';
import { getRoleBySlug } from '@/data/careers';
import { trackCtaClick } from '@/lib/analytics';
import { useWebsiteContent } from '@/context/WebsiteContentContext';

const siteUrl = 'https://besouhola.com';

const CareerRole = () => {
  const { jobSlug } = useParams();
  const { careerRoles } = useWebsiteContent();
  const role = getRoleBySlug(jobSlug, careerRoles);
  const [isApplicationOpen, setIsApplicationOpen] = React.useState(false);

  if (!role) {
    return <Navigate to="/career" replace />;
  }

  const handleApply = () => {
    trackCtaClick('Apply for role', { meta: { location: 'career-role', role: role.title } });
    setIsApplicationOpen(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        document
          .getElementById('career-application-form')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 140);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.45 }}
      className="bg-[#0C0D0D] text-white"
    >
      <Helmet>
        <title>{role.title} | Be Souhola Careers</title>
        <meta name="description" content={role.summary} />
        <link rel="canonical" href={`${siteUrl}/career/${role.slug || jobSlug}`} />
        <meta property="og:title" content={`${role.title} | Be Souhola Careers`} />
        <meta property="og:description" content={role.summary} />
        <meta property="og:url" content={`${siteUrl}/career/${role.slug || jobSlug}`} />
        <meta property="og:type" content="article" />
        <meta name="twitter:title" content={`${role.title} | Be Souhola Careers`} />
        <meta name="twitter:description" content={role.summary} />
      </Helmet>

      <section className="relative overflow-hidden px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8 lg:pb-24 lg:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_32%),linear-gradient(180deg,rgba(7,8,13,0.92),rgba(7,8,13,1))]" />
        <div className="relative mx-auto max-w-[1280px]">
          <Link
            to="/career"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to careers
          </Link>

          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-14">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent-purple/20 bg-accent-purple/10 px-4 py-2 text-sm uppercase tracking-[0.2em] text-[#c5b8ff]">
                <Sparkles className="h-4 w-4 text-accent-purple" />
                {role.department}
              </div>

              <h1 className="mt-6 max-w-4xl text-[clamp(2.8rem,7vw,4.9rem)] font-bold uppercase leading-[0.96]">
                {role.title}
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-300">{role.description}</p>

              <div className="mt-8 flex flex-wrap gap-3 text-sm text-gray-200">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <MapPin className="h-4 w-4 text-accent-purple" />
                  {role.location}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Clock3 className="h-4 w-4 text-accent-purple" />
                  {role.employmentType || role.employment_type}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Briefcase className="h-4 w-4 text-accent-purple" />
                  {role.experienceLevel || role.experience_level}
                </div>
              </div>

              <div className="mt-10 grid gap-6 xl:grid-cols-2">
                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-6">
                  <h2 className="text-xl font-semibold uppercase text-white">Responsibilities</h2>
                  <div className="mt-5 space-y-3">
                    {role.responsibilities.map((item) => (
                      <div key={item} className="flex items-start gap-3 text-gray-300">
                        <span className="mt-2 h-2 w-2 rounded-full bg-accent-purple" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-6">
                  <h2 className="text-xl font-semibold uppercase text-white">Requirements</h2>
                  <div className="mt-5 space-y-3">
                    {role.requirements.map((item) => (
                      <div key={item} className="flex items-start gap-3 text-gray-300">
                        <span className="mt-2 h-2 w-2 rounded-full bg-emerald-300" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isApplicationOpen ? (
                  <motion.div
                    id="career-application-form"
                    initial={{ opacity: 0, y: 34, scale: 0.985, filter: 'blur(12px)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: 18, scale: 0.99, filter: 'blur(6px)' }}
                    transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-10 scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.25)] md:p-5 xl:mt-12"
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.36 }}
                    >
                      <CareerApplicationForm
                        roleSlug={role.slug}
                        roleTitle={role.title}
                        formName={`Career Role Application - ${role.title}`}
                        headline={`Apply for ${role.title}`}
                        subtitle="Share your background, answer a few screening questions, and attach your CV. This application goes directly to our hiring flow."
                      />
                    </motion.div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <aside className="lg:sticky lg:top-28 xl:top-32">
              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.08 }}
                className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Hiring now
                </div>

                <h2 className="mt-5 text-2xl font-bold uppercase text-white">Apply for this role</h2>
                <p className="mt-3 text-gray-300">
                  If this sounds like the right fit, send your application and our team will review it carefully.
                </p>

                <div className="mt-6 space-y-3 text-sm text-gray-300">
                  {role.benefits.map((benefit) => (
                    <div key={benefit} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      {benefit}
                    </div>
                  ))}
                </div>

                <Button
                  className="group mt-7 w-full rounded-full bg-accent-purple py-6 text-white shadow-[0_12px_30px_rgba(147,114,255,0.34)] hover:bg-accent-purple/90"
                  onClick={handleApply}
                >
                  {isApplicationOpen ? 'Application Open' : 'Apply Now'}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>

                <p className="mt-4 text-sm text-white/50">
                  {isApplicationOpen
                    ? 'The form is now ready below. Share your details and CV when you are ready.'
                    : 'Open the dedicated application form only when you are ready to apply.'}
                </p>
              </motion.div>
            </aside>
          </div>
        </div>
      </section>
    </motion.div>
  );
};

export default CareerRole;
