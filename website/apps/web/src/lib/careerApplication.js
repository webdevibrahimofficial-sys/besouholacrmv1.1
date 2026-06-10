import { buildAnalyticsContext, trackFormSubmit } from '@/lib/analytics';
import { buildLeadMeta } from '@/lib/utm';

const getCareerEndpoint = () => {
  const apiKey = import.meta.env.VITE_WEBSITE_INTAKE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Website intake API key is not configured.');
  }

  const rawApiBase = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    'http://127.0.0.1:8000'
  ).trim();

  const endpointBase = rawApiBase.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${endpointBase}/api/intake/website/${apiKey}/career-application`;
};

const formatValidationErrors = (errors) => {
  if (!errors || typeof errors !== 'object') {
    return 'Please check the form and try again.';
  }

  const messages = Object.values(errors).flat();
  return messages[0] || 'Please check the form and try again.';
};

export const submitCareerApplication = async ({
  formName,
  fullName,
  email,
  phone,
  roleSlug,
  roleTitle,
  currentRole,
  yearsExperience,
  location,
  workPreference,
  linkedinUrl,
  portfolioUrl,
  salaryExpectation,
  availability,
  motivation,
  biggestAchievement,
  coverLetter,
  answers,
  cvFile,
}) => {
  const endpoint = getCareerEndpoint();
  const analyticsContext = buildAnalyticsContext({ form_name: formName });

  const formData = new FormData();
  formData.append('full_name', fullName.trim());
  formData.append('email', email.trim());
  formData.append('phone', phone.trim());

  if (roleSlug?.trim()) formData.append('role_slug', roleSlug.trim());
  if (roleTitle?.trim()) formData.append('role_title', roleTitle.trim());
  if (currentRole?.trim()) formData.append('current_role', currentRole.trim());
  if (yearsExperience?.trim()) formData.append('years_experience', yearsExperience.trim());
  if (location?.trim()) formData.append('location', location.trim());
  if (workPreference?.trim()) formData.append('work_preference', workPreference.trim());
  if (linkedinUrl?.trim()) formData.append('linkedin_url', linkedinUrl.trim());
  if (portfolioUrl?.trim()) formData.append('portfolio_url', portfolioUrl.trim());
  if (salaryExpectation?.trim()) formData.append('salary_expectation', salaryExpectation.trim());
  if (availability?.trim()) formData.append('availability', availability.trim());
  if (motivation?.trim()) formData.append('motivation', motivation.trim());
  if (biggestAchievement?.trim()) formData.append('biggest_achievement', biggestAchievement.trim());
  if (coverLetter?.trim()) formData.append('cover_letter', coverLetter.trim());
  if (cvFile) formData.append('cv', cvFile);

  if (answers && typeof answers === 'object') {
    Object.entries(answers).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        formData.append(`answers[${key}]`, value.trim());
      }
    });
  }

  formData.append(
    'meta',
    JSON.stringify(
      buildLeadMeta({
        formName,
        roleSlug: roleSlug?.trim() || undefined,
        roleTitle: roleTitle?.trim() || undefined,
        sessionId: analyticsContext.session_id,
        device: analyticsContext.device,
        browser: analyticsContext.browser,
        referrer: analyticsContext.referrer,
      })
    )
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.message ||
      formatValidationErrors(data?.errors) ||
      'Failed to submit your application. Please try again.';

    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  void trackFormSubmit(formName);

  return data;
};
