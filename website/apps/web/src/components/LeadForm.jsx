import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  User2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { submitWebsiteLead } from '@/lib/websiteLead';
import { trackFormError, trackFormStart, trackFormView } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const defaultServiceOptions = [
  'General Business CRM (Sales & Marketing)',
  'Real Estate CRM (Property & Lead Management)',
  'Other',
];

const normalizeServiceOption = (option) => {
  if (typeof option === 'string') {
    const value = option.trim();
    return value ? { value, label: value, itemId: null } : null;
  }

  if (!option || typeof option !== 'object') {
    return null;
  }

  const label = String(option.label ?? option.name ?? option.value ?? '').trim();
  if (!label) {
    return null;
  }

  const rawValue = option.value ?? option.id ?? label;
  const value = String(rawValue).trim();

  return {
    value: value || label,
    label,
    itemId: option.itemId ?? option.id ?? null,
  };
};

const LeadForm = ({
  formName = 'Website Lead Form',
  className,
  compact = false,
  onSuccess,
  serviceOptions = defaultServiceOptions,
  nameLabel = 'Full name *',
  namePlaceholder = 'John Doe',
  phoneLabel = 'Phone number *',
  phonePlaceholder = '+20 100 000 0000',
  emailLabel = 'Email address',
  emailPlaceholder = 'you@company.com',
  serviceLabel = 'Service interested in',
  servicePlaceholder = 'Select your business type',
  messageLabel,
  messagePlaceholder,
  privacyNote = 'Your data stays private and is only used to contact you.',
  submitLabel = 'Request Demo',
  successTitle = 'Thank you!',
  successMessage = 'We received your request. Our team will contact you shortly.',
  successResetText = 'Submit another request',
}) => {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const hasTrackedView = useRef(false);
  const hasTrackedStart = useRef(false);
  const textareaRef = useRef(null);
  const normalizedServiceOptions = serviceOptions
    .map(normalizeServiceOption)
    .filter(Boolean);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      service: '',
      message: '',
    },
  });

  useEffect(() => {
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

  const autoResizeTextarea = (target) => {
    if (!target) return;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
  };

  const onSubmit = async (values) => {
    setSubmitError('');

    try {
      const selectedService = normalizedServiceOptions.find((option) => option.value === values.service);

      await submitWebsiteLead({
        ...values,
        service: selectedService?.label || values.service,
        itemId: selectedService?.itemId ?? null,
        formName,
      });

      setSubmitted(true);
      reset();
      hasTrackedStart.current = false;
      onSuccess?.();
    } catch (error) {
      const message = error.message || 'Something went wrong. Please try again.';
      setSubmitError(message);
      trackFormError(formName, message);
    }
  };

  if (submitted) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-accent-purple/30 bg-accent-purple/10 p-8 text-center',
          className
        )}
      >
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-accent-purple" />
        <h3 className="mb-2 text-2xl font-bold text-white">{successTitle}</h3>
        <p className="text-gray-300">{successMessage}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 rounded-full border-accent-purple/40 text-white hover:bg-accent-purple/10"
          onClick={() => setSubmitted(false)}
        >
          {successResetText}
        </Button>
      </div>
    );
  }

  const fieldHandlers = (fieldRegister) => ({
    ...fieldRegister,
    onFocus: (event) => {
      handleFieldFocus();
      fieldRegister.onFocus?.(event);
    },
  });

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [compact]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        'rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 backdrop-blur-md md:p-8',
        className
      )}
      noValidate
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formName}-name`} className="text-gray-300">
            {nameLabel}
          </Label>
          <div className="relative">
            <User2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-name`}
              placeholder={namePlaceholder}
              autoComplete="name"
              className="h-14 rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
              {...fieldHandlers(register('name', { required: 'Name is required' }))}
            />
          </div>
          {errors.name && <p className="text-sm text-red-400">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-phone`} className="text-gray-300">
            {phoneLabel}
          </Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-phone`}
              type="tel"
              placeholder={phonePlaceholder}
              autoComplete="tel"
              className="h-14 rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
              {...fieldHandlers(register('phone', { required: 'Phone number is required' }))}
            />
          </div>
          {errors.phone && <p className="text-sm text-red-400">{errors.phone.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formName}-email`} className="text-gray-300">
            {emailLabel}
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id={`${formName}-email`}
              type="email"
              placeholder={emailPlaceholder}
              autoComplete="email"
              className="h-14 rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
              {...fieldHandlers(
                register('email', {
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
          <Label htmlFor={`${formName}-service`} className="text-gray-300">
            {serviceLabel}
          </Label>
          <div className="relative">
            <select
              id={`${formName}-service`}
              className="h-14 w-full appearance-none rounded-2xl border border-white/10 bg-black/25 px-4 pr-12 text-white focus:border-accent-purple/50 focus:outline-none"
              {...fieldHandlers(register('service'))}
            >
              <option value="" className="bg-[#12151f] text-white/70">
                {servicePlaceholder}
              </option>
              {normalizedServiceOptions.map((option) => (
                <option key={`${option.value}-${option.label}`} value={option.value} className="bg-[#12151f] text-white">
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${formName}-message`} className="text-gray-300">
            {messageLabel || (compact ? 'Notes' : 'How can we help?')}
          </Label>
          <div className="relative">
            <MessageSquare className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-white/35" />
            <Textarea
              ref={textareaRef}
              id={`${formName}-message`}
              placeholder={
                messagePlaceholder ||
                (compact
                  ? 'Anything we should know before we contact you?'
                  : "Tell us about your business and what you're looking for...")
              }
              rows={2}
              className="resize-none overflow-hidden rounded-2xl border-white/10 bg-black/25 pl-11 pt-4 text-white placeholder:text-white/35 focus-visible:ring-accent-purple/60"
              {...fieldHandlers(register('message'))}
              onInput={(event) => {
                autoResizeTextarea(event.currentTarget);
              }}
            />
          </div>
        </div>
      </div>

      {submitError && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {submitError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex items-center gap-2 text-sm text-white/65">
          <ShieldCheck className="h-4 w-4 text-accent-purple" />
          {privacyNote}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg"
          className="w-full rounded-full bg-accent-purple text-white hover:bg-accent-purple/90 md:w-auto md:min-w-[220px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              {submitLabel}
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default LeadForm;
