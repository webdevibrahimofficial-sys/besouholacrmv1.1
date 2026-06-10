import React from 'react';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileUp,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  User2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { trackFormError, trackFormStart, trackFormView } from '@/lib/analytics';
import { submitCareerApplication } from '@/lib/careerApplication';
import { cn } from '@/lib/utils';

const experienceOptions = ['0-1 years', '1-3 years', '3-5 years', '5-8 years', '8+ years'];
const workPreferenceOptions = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const availabilityOptions = ['Immediately', 'Within 2 weeks', 'Within 1 month', 'More than 1 month'];

const CareerApplicationForm = ({
  className,
  roleSlug = '',
  roleTitle = '',
  formName = 'Career Application Form',
  headline = 'Apply for this role',
  subtitle = 'Tell us a bit about yourself and attach your CV. We will review every application carefully.',
  compact = false,
}) => {
  const [submitted, setSubmitted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [selectedFileName, setSelectedFileName] = React.useState('');
  const hasTrackedView = React.useRef(false);
  const hasTrackedStart = React.useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      currentRole: '',
      yearsExperience: '',
      location: '',
      workPreference: '',
      linkedinUrl: '',
      portfolioUrl: '',
      salaryExpectation: '',
      availability: '',
      motivation: '',
      biggestAchievement: '',
      coverLetter: '',
      cvFile: null,
    },
  });

  const cvField = register('cvFile', {
    validate: (value) => {
      if (!(value instanceof File)) {
        return 'CV file is required';
      }

      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      if (!allowedTypes.includes(value.type)) {
        return 'Upload a PDF, DOC, or DOCX file';
      }

      if (value.size > 5 * 1024 * 1024) {
        return 'CV file must be 5 MB or smaller';
      }

      return true;
    },
  });

  React.useEffect(() => {
    if (!hasTrackedView.current) {
      hasTrackedView.current = true;
      trackFormView(formName);
    }
  }, [formName]);

  const handleFieldFocus = () => {
    if (!hasTrackedStart.current) {
      hasTrackedStart.current = true;
      trackFormStart(formName);
    }
  };

  const fieldHandlers = (fieldRegister) => ({
    ...fieldRegister,
    onFocus: (event) => {
      handleFieldFocus();
      fieldRegister.onFocus?.(event);
    },
  });

  const cvFile = watch('cvFile');

  React.useEffect(() => {
    if (cvFile instanceof File) {
      setSelectedFileName(cvFile.name);
      return;
    }

    setSelectedFileName('');
  }, [cvFile]);

  const onSubmit = async (values) => {
    setSubmitError('');

    try {
      await submitCareerApplication({
        formName,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        roleSlug,
        roleTitle,
        currentRole: values.currentRole,
        yearsExperience: values.yearsExperience,
        location: values.location,
        workPreference: values.workPreference,
        linkedinUrl: values.linkedinUrl,
        portfolioUrl: values.portfolioUrl,
        salaryExpectation: values.salaryExpectation,
        availability: values.availability,
        motivation: values.motivation,
        biggestAchievement: values.biggestAchievement,
        coverLetter: values.coverLetter,
        cvFile: values.cvFile,
        answers: {
          motivation: values.motivation,
          biggest_achievement: values.biggestAchievement,
          cover_letter: values.coverLetter,
        },
      });

      setSubmitted(true);
      reset();
      setSelectedFileName('');
      hasTrackedStart.current = false;
    } catch (error) {
      const isMissingApiKey = error?.message === 'Website intake API key is not configured.';
      const message = isMissingApiKey
        ? 'Unable to send your application right now. Please contact us directly.'
        : error?.message || 'Something went wrong. Please try again.';

      if (isMissingApiKey && import.meta.env.DEV) {
        console.error('Website intake API key is not configured.');
      }

      setSubmitError(message);
      trackFormError(formName, message);
    }
  };

  if (submitted) {
    return (
      <div
        className={cn(
          'rounded-[1.7rem] border border-emerald-400/25 bg-emerald-400/10 p-8 text-center',
          className
        )}
      >
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-300" />
        <h3 className="text-2xl font-bold text-white">Application submitted</h3>
        <p className="mt-3 text-gray-200">
          Your profile has been sent successfully. Our hiring team will review it and get back to
          you if there is a fit.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
          onClick={() => setSubmitted(false)}
        >
          Submit another application
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        'overflow-visible rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 backdrop-blur-md sm:p-6 md:p-7',
        className
      )}
      noValidate
    >
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-purple/20 bg-accent-purple/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#c5b8ff]">
          <Sparkles className="h-3.5 w-3.5 text-accent-purple" />
          Career application
        </div>
        <h3 className="mt-4 text-2xl font-bold uppercase text-white md:text-[1.9rem]">{headline}</h3>
        <p className="mt-2 max-w-2xl text-gray-300">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <div className="space-y-2">
          <Label htmlFor={`${formName}-fullName`} className="text-gray-300">
            Full name *
          </Label>
          <div className="relative">
            <User2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-fullName`}
              placeholder="Your full name"
              autoComplete="name"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(register('fullName', { required: 'Full name is required' }))}
            />
          </div>
          {errors.fullName && <p className="text-sm text-red-400">{errors.fullName.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-email`} className="text-gray-300">
            Email address *
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-email`}
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(
                register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })
              )}
            />
          </div>
          {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-phone`} className="text-gray-300">
            Phone number *
          </Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-phone`}
              type="tel"
              placeholder="+20 100 000 0000"
              autoComplete="tel"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(register('phone', { required: 'Phone number is required' }))}
            />
          </div>
          {errors.phone && <p className="text-sm text-red-400">{errors.phone.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-currentRole`} className="text-gray-300">
            Current role
          </Label>
          <div className="relative">
            <Briefcase className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-currentRole`}
              placeholder="Frontend Developer"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(register('currentRole'))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-yearsExperience`} className="text-gray-300">
            Years of experience
          </Label>
          <select
            id={`${formName}-yearsExperience`}
            className="h-[3.25rem] w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white focus:border-accent-purple/50 focus:outline-none md:h-14"
            {...fieldHandlers(register('yearsExperience'))}
          >
            <option value="" className="bg-[#12151f] text-white/70">
              Select experience range
            </option>
            {experienceOptions.map((option) => (
              <option key={option} value={option} className="bg-[#12151f] text-white">
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-location`} className="text-gray-300">
            Current location
          </Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-location`}
              placeholder="Cairo, Egypt"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(register('location'))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-workPreference`} className="text-gray-300">
            Work preference
          </Label>
          <select
            id={`${formName}-workPreference`}
            className="h-[3.25rem] w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white focus:border-accent-purple/50 focus:outline-none md:h-14"
            {...fieldHandlers(register('workPreference'))}
          >
            <option value="" className="bg-[#12151f] text-white/70">
              Select preference
            </option>
            {workPreferenceOptions.map((option) => (
              <option key={option} value={option} className="bg-[#12151f] text-white">
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-availability`} className="text-gray-300">
            Availability
          </Label>
          <select
            id={`${formName}-availability`}
            className="h-[3.25rem] w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white focus:border-accent-purple/50 focus:outline-none md:h-14"
            {...fieldHandlers(register('availability'))}
          >
            <option value="" className="bg-[#12151f] text-white/70">
              When can you start?
            </option>
            {availabilityOptions.map((option) => (
              <option key={option} value={option} className="bg-[#12151f] text-white">
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-linkedinUrl`} className="text-gray-300">
            LinkedIn profile
          </Label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-linkedinUrl`}
              placeholder="https://linkedin.com/in/your-profile"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(
                register('linkedinUrl', {
                  pattern: {
                    value: /^$|^https?:\/\/.+/i,
                    message: 'Enter a valid URL starting with http:// or https://',
                  },
                })
              )}
            />
          </div>
          {errors.linkedinUrl && <p className="text-sm text-red-400">{errors.linkedinUrl.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-portfolioUrl`} className="text-gray-300">
            Portfolio / GitHub / Behance
          </Label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-portfolioUrl`}
              placeholder="https://your-portfolio.com"
              className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
              {...fieldHandlers(
                register('portfolioUrl', {
                  pattern: {
                    value: /^$|^https?:\/\/.+/i,
                    message: 'Enter a valid URL starting with http:// or https://',
                  },
                })
              )}
            />
          </div>
          {errors.portfolioUrl && <p className="text-sm text-red-400">{errors.portfolioUrl.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-salaryExpectation`} className="text-gray-300">
            Salary expectation
          </Label>
          <Input
            id={`${formName}-salaryExpectation`}
            placeholder="Optional"
            className="h-[3.25rem] rounded-2xl border-white/10 bg-black/25 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60 md:h-14"
            {...fieldHandlers(register('salaryExpectation'))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-cvFile`} className="text-gray-300">
            CV / Resume *
          </Label>
          <label
            htmlFor={`${formName}-cvFile`}
            className="flex min-h-[3.25rem] cursor-pointer items-center justify-between rounded-2xl border border-dashed border-white/15 bg-black/25 px-4 py-3 text-white transition-colors hover:border-accent-purple/50 hover:bg-black/30 md:min-h-14"
          >
            <span className="flex items-center gap-3 overflow-hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-purple/12 text-accent-purple">
                <FileUp className="h-4 w-4" />
              </span>
              <span className="truncate text-sm text-gray-200">
                {selectedFileName || 'Upload PDF or DOCX file'}
              </span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.15em] text-white/70">
              Browse
            </span>
          </label>
          <input
            id={`${formName}-cvFile`}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            name={cvField.name}
            ref={cvField.ref}
            onBlur={cvField.onBlur}
            onChange={(event) => {
              handleFieldFocus();
              const file = event.target.files?.[0] ?? null;
              cvField.onChange({
                target: {
                  name: cvField.name,
                  value: file,
                },
              });
            }}
          />
          {errors.cvFile && <p className="text-sm text-red-400">{errors.cvFile.message}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${formName}-motivation`} className="text-gray-300">
            Why do you want to join Be Souhola?
          </Label>
          <div className="relative">
            <MessageSquare className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-white/35" />
            <Textarea
              id={`${formName}-motivation`}
              rows={compact ? 3 : 4}
              placeholder="Tell us what attracts you to this role and why you'd be a strong fit."
              className="min-h-[132px] rounded-2xl border-white/10 bg-black/25 pl-11 pt-4 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
              {...fieldHandlers(register('motivation'))}
            />
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${formName}-biggestAchievement`} className="text-gray-300">
            What is one professional achievement you are proud of?
          </Label>
          <div className="relative">
            <Sparkles className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-white/35" />
            <Textarea
              id={`${formName}-biggestAchievement`}
              rows={compact ? 3 : 4}
              placeholder="Share a result, project, or moment that reflects your best work."
              className="min-h-[132px] rounded-2xl border-white/10 bg-black/25 pl-11 pt-4 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
              {...fieldHandlers(register('biggestAchievement'))}
            />
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${formName}-coverLetter`} className="text-gray-300">
            Anything else we should know?
          </Label>
          <Textarea
            id={`${formName}-coverLetter`}
            rows={compact ? 3 : 4}
            placeholder="Add any relevant context, availability notes, or links you want us to review."
            className="min-h-[120px] rounded-2xl border-white/10 bg-black/25 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
            {...fieldHandlers(register('coverLetter'))}
          />
        </div>
      </div>

      {submitError && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {submitError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex items-start gap-2 text-sm leading-relaxed text-white/65 lg:max-w-[62%]">
          <ShieldCheck className="h-4 w-4 text-accent-purple" />
          Your application is reviewed privately by our hiring team and will not be mixed with sales
          or website demo requests.
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg"
          className="w-full rounded-full bg-accent-purple text-white hover:bg-accent-purple/90 lg:w-auto lg:min-w-[240px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              Submit Application
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default CareerApplicationForm;
