import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import LeadForm from '@/components/LeadForm';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { trackCtaClick } from '@/lib/analytics';

const DemoRequestModal = ({
  trigger,
  location = 'website',
  formName = 'Book Demo Modal',
  title = 'Book Your Free CRM Demo',
  description = "Tell us about your business and we'll contact you within 24 hours.",
}) => {
  const { hero, leadServiceOptions } = useWebsiteContent();

  return (
    <Dialog>
      <DialogTrigger
        asChild
        onClick={() => {
          trackCtaClick('Book Free Demo', { meta: { location } });
        }}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-white/10 bg-[#0f1117] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
        <div className="rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(147,114,255,0.18),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-5 sm:p-7">
          <DialogHeader className="mb-5 text-left">
            <div className="inline-flex w-fit items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-emerald-200">
              CRM Demo
            </div>
            <DialogTitle className="mt-3 text-3xl font-bold uppercase leading-tight text-white sm:text-[2.2rem]">
              {title}
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-base leading-7 text-gray-300">
              {description}
            </DialogDescription>
          </DialogHeader>

          <LeadForm
            formName={formName}
            compact
            showCompanyField
            requireService
            serviceOptions={leadServiceOptions}
            nameLabel={hero.name_label || 'Full Name *'}
            namePlaceholder={hero.name_placeholder || 'John Doe'}
            phoneLabel={hero.phone_label || 'Phone Number *'}
            phonePlaceholder={hero.phone_placeholder || '+20 100 000 0000'}
            companyLabel="Company Name"
            companyPlaceholder="Your company"
            emailLabel="Email (optional)"
            emailPlaceholder={hero.email_placeholder || 'you@company.com'}
            serviceLabel="Business Type *"
            servicePlaceholder={hero.service_placeholder || 'Select your business type'}
            messageLabel="Notes (optional)"
            messagePlaceholder={hero.message_placeholder || 'Anything we should know before we contact you?'}
            privacyNote={hero.privacy_note}
            submitLabel="Request Free Demo"
            successTitle={hero.success_title}
            successMessage={hero.success_message}
            successResetText={hero.success_reset_text}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemoRequestModal;
