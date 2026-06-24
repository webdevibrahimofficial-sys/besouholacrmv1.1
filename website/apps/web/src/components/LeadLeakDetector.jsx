import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Layers3,
  Loader2,
  Mail,
  Megaphone,
  Package,
  Phone,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  User2,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWebsiteContent } from '@/context/WebsiteContentContext';
import { trackLeadLeakDetectorEvent } from '@/lib/analytics';
import { submitWebsiteLead } from '@/lib/websiteLead';
import appShowcaseImage from '@/assets/be-souhola-app-showcase.jpeg';
import { resolveImageFallback } from '@/lib/websiteAssets';

const defaultQuestions = [
  {
    prompt: 'How long does it usually take before your team makes the first contact with a new lead?',
    options: [
      { label: 'Less than 5 minutes', score: 100, leak: 'speed' },
      { label: '5 to 30 minutes', score: 82, leak: 'speed' },
      { label: '30 minutes to 2 hours', score: 56, leak: 'speed' },
      { label: 'More than 2 hours', score: 24, leak: 'speed' },
      { label: 'We do not know', score: 18, leak: 'visibility' },
    ],
  },
  {
    prompt: 'How are new leads assigned to the sales team today?',
    options: [
      { label: 'Automatically and instantly', score: 100, leak: 'handoff' },
      { label: 'Manually but with clear ownership', score: 78, leak: 'handoff' },
      { label: 'Shared inbox or group chat', score: 46, leak: 'handoff' },
      { label: 'Often unclear or delayed', score: 20, leak: 'handoff' },
    ],
  },
  {
    prompt: 'What usually happens if a lead does not respond after the first outreach?',
    options: [
      { label: 'Automatic reminders keep follow-up consistent', score: 100, leak: 'followup' },
      { label: 'The team follows up manually with a process', score: 74, leak: 'followup' },
      { label: 'Follow-up depends on each rep', score: 42, leak: 'followup' },
      { label: 'Many leads are forgotten', score: 12, leak: 'followup' },
    ],
  },
  {
    prompt: 'How visible is team performance across the pipeline?',
    options: [
      { label: 'We have live dashboards by stage and owner', score: 100, leak: 'visibility' },
      { label: 'We review reports weekly', score: 76, leak: 'visibility' },
      { label: 'Mostly spreadsheets and manual checks', score: 40, leak: 'visibility' },
      { label: 'Very limited visibility', score: 14, leak: 'visibility' },
    ],
  },
  {
    prompt: 'How are leads qualified before sales spends time on them?',
    options: [
      { label: 'Clear qualification rules and forms', score: 100, leak: 'qualification' },
      { label: 'Some qualification questions exist', score: 70, leak: 'qualification' },
      { label: 'Qualification is inconsistent', score: 38, leak: 'qualification' },
      { label: 'Almost no qualification process', score: 16, leak: 'qualification' },
    ],
  },
  {
    prompt: 'How many channels feed leads into your pipeline?',
    options: [
      { label: 'All channels flow into one system', score: 100, leak: 'handoff' },
      { label: 'Most channels are connected', score: 78, leak: 'handoff' },
      { label: 'Some channels are disconnected', score: 44, leak: 'visibility' },
      { label: 'Many channels are handled separately', score: 18, leak: 'visibility' },
    ],
  },
  {
    prompt: 'When a manager asks where deals are getting stuck, how fast can the team answer?',
    options: [
      { label: 'Immediately with live pipeline data', score: 100, leak: 'visibility' },
      { label: 'Within the same day', score: 74, leak: 'visibility' },
      { label: 'It takes manual digging', score: 36, leak: 'visibility' },
      { label: 'We usually cannot answer clearly', score: 10, leak: 'visibility' },
    ],
  },
];

const defaultLeakLabels = {
  speed: 'First-contact delay',
  followup: 'Follow-up process',
  visibility: 'Sales visibility',
  handoff: 'Lead assignment flow',
  qualification: 'Lead qualification',
};

const defaultSolutions = {
  speed: 'Instant alerts and automatic lead routing',
  followup: 'Follow-up reminders and structured cadences',
  visibility: 'Live team performance dashboards',
  handoff: 'Ownership rules and SLA tracking',
  qualification: 'Structured intake forms and lead scoring',
};

const questionAdviceProfiles = {
  first_contact: {
    title: 'First-response speed is costing you intent',
    signal: 'Your answer shows that new leads may wait too long before the first meaningful contact.',
    impact:
      'High-intent leads cool down quickly. When response time depends on manual checks, another competitor can reach the same prospect while your team is still deciding who should call.',
    recommendation:
      'Set a response SLA for new leads, trigger instant notifications, and route every enquiry to an owner within minutes. Managers should see overdue first-contact tasks without asking for updates.',
    beSouholaFit:
      'Be Souhola connects intake, assignment, reminders, and alerts so fresh leads move straight into an accountable follow-up flow.',
  },
  assignment: {
    title: 'Ownership is not clear enough at the handoff point',
    signal: 'Your answer suggests that lead assignment can still rely on people noticing, forwarding, or manually claiming leads.',
    impact:
      'Unclear ownership creates silent leakage: two salespeople may assume someone else is handling the lead, or the lead may sit in a shared channel without a next action.',
    recommendation:
      'Use automatic assignment rules, team capacity logic, and manager escalation for unassigned or delayed leads. Every lead should have one current owner and one visible next action.',
    beSouholaFit:
      'Be Souhola supports assignment ownership, rotation, notifications, and lead status tracking so accountability is visible from the first minute.',
  },
  followup: {
    title: 'Follow-up consistency depends too much on individual habits',
    signal: 'Your answer indicates that non-responsive leads may not always receive structured second and third attempts.',
    impact:
      'Most deals are not won on the first contact. Without scheduled follow-ups, the pipeline looks full but quietly loses leads that only needed timing, persistence, or a better channel.',
    recommendation:
      'Define follow-up cadences by stage, schedule next actions after every call, and use overdue reminders for leads with no recent activity.',
    beSouholaFit:
      'Be Souhola keeps next actions, comments, call outcomes, and reminders attached to the lead so follow-up becomes a process, not memory work.',
  },
  team_visibility: {
    title: 'Management visibility is arriving too late',
    signal: 'Your answer shows that performance may be reviewed after the fact rather than monitored live.',
    impact:
      'Weekly or manual reporting catches leakage after it has already happened. Managers need to spot slow response, stalled stages, and weak ownership while there is still time to act.',
    recommendation:
      'Track leads by source, stage, owner, response delay, and overdue actions. Review exceptions daily instead of waiting for manual reports.',
    beSouholaFit:
      'Be Souhola gives managers live pipeline views, lead analysis, team activity, and delay indicators so coaching can happen before revenue is lost.',
  },
  qualification: {
    title: 'Qualification rules are not strict enough',
    signal: 'Your answer suggests that lead quality depends on inconsistent questions or salesperson judgment.',
    impact:
      'Poor qualification wastes sales time on low-fit prospects and makes serious buyers harder to prioritize. It also weakens reporting because the team cannot separate demand from noise.',
    recommendation:
      'Standardize qualification fields, required questions, buyer intent signals, budget/source notes, and priority levels. Use these rules to decide who gets immediate attention.',
    beSouholaFit:
      'Be Souhola captures structured lead details, priorities, stages, custom fields, and source context so your team can qualify leads consistently.',
  },
  channels: {
    title: 'Lead sources are fragmented across channels',
    signal: 'Your answer points to leads entering from multiple places without one unified operating layer.',
    impact:
      'Disconnected channels make it hard to measure source quality, prevent duplicate follow-up, and ensure every enquiry receives the same level of service.',
    recommendation:
      'Centralize website forms, campaigns, social leads, WhatsApp, calls, and manual entries into one CRM flow with source tracking and unified ownership.',
    beSouholaFit:
      'Be Souhola is designed around connected intake, source visibility, campaign context, and CRM follow-up so every channel lands in one workflow.',
  },
  manager_answer: {
    title: 'Pipeline bottlenecks are hard to explain quickly',
    signal: 'Your answer shows that managers may need manual digging to understand where deals are stuck.',
    impact:
      'When bottlenecks are unclear, the team reacts late. The business cannot easily see whether the issue is source quality, sales activity, stage conversion, or delayed follow-up.',
    recommendation:
      'Build a management rhythm around live pipeline dashboards, stage aging, owner performance, and delayed action lists. Focus weekly meetings on exceptions, not data collection.',
    beSouholaFit:
      'Be Souhola combines stage tracking, reports, activity history, and team views so managers can diagnose pipeline friction without chasing spreadsheets.',
  },
};

const beSouholaSellingPoints = [
  {
    title: 'One operating layer for every lead source',
    detail:
      'Website forms, campaigns, social leads, WhatsApp, calls, and manual entries can be managed in one CRM flow with source context attached.',
  },
  {
    title: 'Clear ownership and faster response',
    detail:
      'Assignment, rotation, notifications, and lead status tracking help every enquiry move quickly to the right salesperson.',
  },
  {
    title: 'Follow-up discipline built into daily work',
    detail:
      'Next actions, comments, call outcomes, reminders, and delay views keep the team from relying on memory or scattered notes.',
  },
  {
    title: 'Management visibility without manual reporting',
    detail:
      'Dashboards and reports show source performance, pipeline movement, team activity, and delayed leads so managers can act earlier.',
  },
  {
    title: 'Flexible enough for real estate and business teams',
    detail:
      'Projects, inventory, customers, marketing modules, tasks, users, and custom fields let the CRM match your actual workflow.',
  },
];

const getQuestionAdviceKey = (question, index) => {
  const prompt = String(question?.prompt || '').toLowerCase();
  if (prompt.includes('first contact')) return 'first_contact';
  if (prompt.includes('assigned')) return 'assignment';
  if (prompt.includes('does not respond')) return 'followup';
  if (prompt.includes('team performance')) return 'team_visibility';
  if (prompt.includes('qualified')) return 'qualification';
  if (prompt.includes('channels')) return 'channels';
  if (prompt.includes('manager asks')) return 'manager_answer';

  return ['first_contact', 'assignment', 'followup', 'team_visibility', 'qualification', 'channels', 'manager_answer'][index] || 'team_visibility';
};

const buildAnswerBasedAdvice = (questions, answers) => {
  const items = questions
    .map((question, index) => {
      const answer = answers[index];
      if (!answer) return null;

      const score = Number(answer.score ?? 0);
      if (score >= 82) return null;

      const profile = questionAdviceProfiles[getQuestionAdviceKey(question, index)] || questionAdviceProfiles.team_visibility;
      return {
        ...profile,
        question: question.prompt,
        answer: answer.label,
        score,
        priority: score < 35 ? 'Critical' : score < 60 ? 'High' : 'Medium',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);

  if (items.length > 0) {
    return items;
  }

  return [
    {
      ...questionAdviceProfiles.team_visibility,
      question: 'Overall pipeline health',
      answer: 'Strong answers across the audit',
      score: 90,
      priority: 'Optimization',
      signal:
        'Your answers show a generally healthy pipeline. The next opportunity is improving visibility, speed, and consistency at scale.',
      recommendation:
        'Use Be Souhola to standardize reporting, compare sources, and keep follow-up performance measurable as the team grows.',
    },
  ];
};

const mobileFeatureCards = [
  {
    icon: User2,
    label: 'Leads',
    sublabel: 'Follow-up pipeline',
    description: 'Assign leads instantly, log every touchpoint, and keep reps moving from first contact to close.',
  },
  {
    icon: ClipboardList,
    label: 'Tasks',
    sublabel: 'Daily execution',
    description: 'See what is due today, who owns it, and which callbacks or reminders need immediate action.',
  },
  {
    icon: Building2,
    label: 'Projects',
    sublabel: 'Inventory tracking',
    description: 'Open inventory, track project details, and connect opportunities to the right unit or property.',
  },
  {
    icon: BarChart3,
    label: 'Reports',
    sublabel: 'Manager visibility',
    description: 'Check team performance, delayed follow-up, and pipeline progress without waiting for office reports.',
  },
];

const mobileAppBenefits = [
  'Follow up from anywhere',
  'Assign leads instantly',
  'Manage projects on the go',
];

const slugifyQuestion = (value, index) =>
  String(value || `question_${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `question_${index + 1}`;

const scoreTone = (score) => {
  if (score >= 80) {
    return {
      risk: 'Low',
      accent: 'text-emerald-300',
      chip: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
      glow: 'from-emerald-500/20 via-emerald-400/10 to-transparent',
      loss: 'Minor leakage pressure',
    };
  }

  if (score >= 55) {
    return {
      risk: 'Medium',
      accent: 'text-amber-200',
      chip: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
      glow: 'from-amber-500/20 via-amber-400/10 to-transparent',
      loss: 'Moderate leakage pressure',
    };
  }

  return {
    risk: 'High',
    accent: 'text-rose-200',
    chip: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    glow: 'from-rose-500/20 via-rose-400/10 to-transparent',
    loss: 'High leakage pressure',
  };
};

const LeadLeakDetector = () => {
  const { leadLeakDetector } = useWebsiteContent();
  const [isOpen, setIsOpen] = useState(false);
  const [showFloatingTrigger, setShowFloatingTrigger] = useState(false);
  const [started, setStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [openSource, setOpenSource] = useState('hero_card');
  const [activeHeroPanelIndex, setActiveHeroPanelIndex] = useState(0);
  const [activeMobileFeatureIndex, setActiveMobileFeatureIndex] = useState(0);
  const [isHeroCarouselPaused, setIsHeroCarouselPaused] = useState(false);
  const [leadCaptureMode, setLeadCaptureMode] = useState(null);
  const [appPreviewSrc, setAppPreviewSrc] = useState(appShowcaseImage);
  const [leadForm, setLeadForm] = useState({
    name: '',
    phone: '',
    company: '',
    email: '',
  });
  const [leadFormState, setLeadFormState] = useState({
    viewing: false,
    started: false,
    submitting: false,
    success: false,
    error: '',
    reportUrl: '',
  });

  const content = useMemo(() => {
    const questions =
      Array.isArray(leadLeakDetector?.questions) && leadLeakDetector.questions.length > 0
        ? leadLeakDetector.questions
        : defaultQuestions;

    return {
      eyebrow: leadLeakDetector?.eyebrow || 'Free sales audit',
      title: leadLeakDetector?.title || 'Are leads slipping through your pipeline?',
      subtitle:
        leadLeakDetector?.subtitle ||
        'Answer 7 quick questions and uncover the top three sales leaks holding your team back in under 60 seconds.',
      items:
        Array.isArray(leadLeakDetector?.items) && leadLeakDetector.items.length > 0
          ? leadLeakDetector.items
          : ['First-response speed', 'Lead leakage points', 'Follow-up consistency'],
      buttonText: leadLeakDetector?.button_text || 'Start the audit',
      floatingButtonText: leadLeakDetector?.floating_button_text || 'Test your pipeline',
      appEyebrow: leadLeakDetector?.app_eyebrow || 'Mobile app',
      appHeadline:
        leadLeakDetector?.app_headline || 'Manage leads, teams, and projects from anywhere',
      appDescription:
        leadLeakDetector?.app_description ||
        'Give your sales team a fast mobile workspace to follow up leads, manage tasks, and stay updated in the field.',
      appImageUrl: leadLeakDetector?.app_image_url || appShowcaseImage,
      appHighlights:
        Array.isArray(leadLeakDetector?.app_highlights) &&
        leadLeakDetector.app_highlights.length > 0
          ? leadLeakDetector.app_highlights
          : ['Lead follow-up', 'Team tasks', 'Real estate inventory', 'Instant reminders'],
      appTitle: leadLeakDetector?.app_title || 'Be Souhola Mobile App',
      appSubtitle:
        leadLeakDetector?.app_subtitle ||
        'A polished mobile workspace for sales teams, projects, and daily follow-up.',
      appItems:
        Array.isArray(leadLeakDetector?.app_items) && leadLeakDetector.app_items.length > 0
          ? leadLeakDetector.app_items
          : ['Leads', 'Tasks', 'Projects', 'Reports'],
      appButtonText: leadLeakDetector?.app_button_text || 'See the mobile app in action',
      appAvailabilityText:
        leadLeakDetector?.app_availability_text || 'Mobile app available for your sales team',
      integrationEyebrow: leadLeakDetector?.integration_eyebrow || 'Live integrations',
      integrationHeadline:
        leadLeakDetector?.integration_headline || 'Plug every lead source into one CRM flow',
      integrationDescription:
        leadLeakDetector?.integration_description ||
        'Show that Meta, website forms, chat, ads, WhatsApp, and notifications all land inside one connected operating layer for your sales team.',
      integrationHighlights:
        Array.isArray(leadLeakDetector?.integration_highlights) &&
        leadLeakDetector.integration_highlights.length > 0
          ? leadLeakDetector.integration_highlights
          : ['Unified lead intake', 'Live source visibility', 'Faster follow-up handoff'],
      integrationTitle: leadLeakDetector?.integration_title || 'Live Integration Badge',
      integrationSubtitle:
        leadLeakDetector?.integration_subtitle ||
        'Show that every lead source, chat, and notification flow can live inside one connected CRM engine.',
      integrationItems:
        Array.isArray(leadLeakDetector?.integration_items) && leadLeakDetector.integration_items.length > 0
          ? leadLeakDetector.integration_items
          : ['Meta Leads', 'Website Forms', 'Website Chat', 'Google Ads', 'WhatsApp', 'Email Notifications'],
      integrationButtonText:
        leadLeakDetector?.integration_button_text || 'See integrations in action',
      resultCtaText: leadLeakDetector?.result_cta_text || 'Book a result-based demo',
      resultSecondaryText:
        leadLeakDetector?.result_secondary_text || 'See how Be Souhola closes these leaks',
      modalTitle: leadLeakDetector?.modal_title || 'Lead Leak Detector',
      modalSubtitle:
        leadLeakDetector?.modal_subtitle ||
        'A guided sales health check that shows where your pipeline is losing qualified leads before they turn into revenue.',
      modalNote:
        leadLeakDetector?.modal_note || '7 quick questions. No sensitive financial data. Instant result.',
      modalStartText: leadLeakDetector?.modal_start_text || 'Start diagnosis',
      reportPrompt:
        leadLeakDetector?.report_prompt ||
        'Want a walkthrough tailored to your result? See how Be Souhola fixes these leaks with automation, alerts, and performance reporting.',
      solutionHeading: leadLeakDetector?.solution_heading || 'Your Issue -> Be Souhola Solution',
      estimatedLossLabel: leadLeakDetector?.estimated_loss_label || 'Estimated revenue drag',
      estimatedLossLow: leadLeakDetector?.estimated_loss_low || 'Minor leakage pressure',
      estimatedLossMedium: leadLeakDetector?.estimated_loss_medium || 'Moderate leakage pressure',
      estimatedLossHigh: leadLeakDetector?.estimated_loss_high || 'High leakage pressure',
      riskLowLabel: leadLeakDetector?.risk_low_label || 'Low',
      riskMediumLabel: leadLeakDetector?.risk_medium_label || 'Medium',
      riskHighLabel: leadLeakDetector?.risk_high_label || 'High',
      leakLabels: {
        ...defaultLeakLabels,
        ...(leadLeakDetector?.leak_labels || {}),
      },
      solutionMap: {
        ...defaultSolutions,
        ...(leadLeakDetector?.solution_map || {}),
      },
      questions,
    };
  }, [leadLeakDetector]);

  useEffect(() => {
    setAppPreviewSrc(content.appImageUrl || appShowcaseImage);
  }, [content.appImageUrl]);

  useEffect(() => {
    setActiveMobileFeatureIndex(0);
  }, [activeHeroPanelIndex]);

  const progress = content.questions.length
    ? Math.round((answers.length / content.questions.length) * 100)
    : 0;

  const heroPanels = useMemo(
    () => [
      {
        key: 'mobile_app',
        eyebrow: content.appEyebrow,
        headline: content.appHeadline,
        description: content.appDescription,
        highlights: content.appHighlights,
        title: content.appTitle,
        subtitle: content.appSubtitle,
        items: content.appItems,
        buttonText: content.appButtonText,
        onClick: () => openDetector('hero_card'),
        variant: 'showcase',
      },
      {
        key: 'detector',
        eyebrow: content.eyebrow,
        headline: content.title,
        description: content.subtitle,
        highlights: content.items,
        icon: Activity,
        iconTone: 'border-violet-400/20 bg-violet-500/10 text-violet-200',
        title: content.modalTitle,
        subtitle: 'Interactive sales health check',
        bullets: [
          {
            icon: ShieldCheck,
            tone: 'text-emerald-300',
            label: 'No sensitive financial data',
          },
          {
            icon: Target,
            tone: 'text-amber-200',
            label: 'Instant score and leak priorities',
          },
        ],
        buttonText: content.buttonText,
        onClick: () => openDetector('hero_card'),
      },
      {
        key: 'integrations',
        eyebrow: content.integrationEyebrow,
        headline: content.integrationHeadline,
        description: content.integrationDescription,
        highlights: content.integrationHighlights,
        icon: Layers3,
        iconTone: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200',
        title: content.integrationTitle,
        subtitle: content.integrationSubtitle,
        bullets: content.integrationItems.slice(0, 6).map((item) => ({
          icon: PlugZap,
          tone: 'text-cyan-200',
          label: item,
        })),
        buttonText: content.integrationButtonText,
        onClick: () => openDetector('hero_card'),
      },
    ],
    [content]
  );

  const activeHeroPanel = heroPanels[activeHeroPanelIndex] || heroPanels[0];
  const activeMobileFeature = mobileFeatureCards[activeMobileFeatureIndex] || mobileFeatureCards[0];

  const currentQuestion = content.questions[currentQuestionIndex];

  const result = useMemo(() => {
    if (answers.length !== content.questions.length || content.questions.length === 0) {
      return null;
    }

    const score = Math.round(
      answers.reduce((sum, answer) => sum + (answer?.score || 0), 0) / content.questions.length
    );

    const leakCounts = answers.reduce((acc, answer) => {
      const leak = answer?.leak || 'visibility';
      acc[leak] = (acc[leak] || 0) + (100 - (answer?.score || 0));
      return acc;
    }, {});

    const topLeaks = Object.entries(leakCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => ({
        key,
        label: content.leakLabels[key] || key,
        solution: content.solutionMap[key] || defaultSolutions[key] || 'Workflow automation and performance visibility',
      }));

    const tone = scoreTone(score);
    const riskLabel =
      tone.risk === 'Low'
        ? content.riskLowLabel
        : tone.risk === 'Medium'
          ? content.riskMediumLabel
          : content.riskHighLabel;
    const estimatedLoss =
      tone.risk === 'Low'
        ? content.estimatedLossLow
        : tone.risk === 'Medium'
          ? content.estimatedLossMedium
          : content.estimatedLossHigh;

    return {
      score,
      tone,
      riskLabel,
      estimatedLoss,
      topLeaks,
      advice: buildAnswerBasedAdvice(content.questions, answers),
    };
  }, [answers, content]);

  const resultPayload = useMemo(() => {
    if (!result) return null;

    const answersMap = content.questions.reduce((acc, question, index) => {
      const answer = answers[index];
      if (!answer) return acc;

      acc[question.id || slugifyQuestion(question.prompt, index)] = {
        label: answer.label,
        score: answer.score,
        leak: answer.leak,
      };
      return acc;
    }, {});

    return {
      source: 'lead_leak_detector',
      score: result.score,
      riskLevel: String(result.riskLabel || '').toLowerCase(),
      topLeaks: result.topLeaks.map((item) => item.key),
      answers: answersMap,
      advice: result.advice,
      sourceTrigger: openSource,
    };
  }, [answers, content.questions, openSource, result]);

  useEffect(() => {
    trackLeadLeakDetectorEvent('lead_leak_detector_card_view');
  }, []);

  useEffect(() => {
    if (heroPanels.length <= 1 || isHeroCarouselPaused) return undefined;

    const timer = window.setInterval(() => {
      setActiveHeroPanelIndex((currentIndex) => (currentIndex + 1) % heroPanels.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [heroPanels.length, isHeroCarouselPaused]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) {
        setShowFloatingTrigger(false);
        return;
      }

      const ratio = window.scrollY / scrollableHeight;
      setShowFloatingTrigger(ratio > 0.2);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!result) return;

    trackLeadLeakDetectorEvent('lead_leak_detector_completed', {
      meta: {
        score: result.score,
        risk_level: result.riskLabel,
        top_leaks: result.topLeaks.map((item) => item.key),
        source_trigger: openSource,
      },
    });
    trackLeadLeakDetectorEvent('lead_leak_detector_result_view', {
      meta: {
        score: result.score,
        risk_level: result.riskLabel,
        top_leaks: result.topLeaks.map((item) => item.key),
        source_trigger: openSource,
      },
    });
  }, [result, openSource]);

  const openDetector = (source) => {
    setOpenSource(source);
    setIsOpen(true);
    trackLeadLeakDetectorEvent('lead_leak_detector_open', {
      meta: { source_trigger: source },
    });
  };

  const closeDetector = () => {
    trackLeadLeakDetectorEvent('lead_leak_detector_close', {
      meta: {
        source_trigger: openSource,
        current_step: started ? currentQuestionIndex + 1 : 0,
        completed: Boolean(result),
      },
    });
    setIsOpen(false);
    setStarted(false);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setLeadCaptureMode(null);
    setLeadForm({ name: '', phone: '', company: '', email: '' });
    setLeadFormState({
      viewing: false,
      started: false,
      submitting: false,
      success: false,
      error: '',
      reportUrl: '',
    });
  };

  const startDetector = () => {
    setStarted(true);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    trackLeadLeakDetectorEvent('lead_leak_detector_start', {
      meta: { source_trigger: openSource },
    });
  };

  const handleAnswer = (option) => {
    const nextAnswers = [...answers];
    nextAnswers[currentQuestionIndex] = option;
    setAnswers(nextAnswers);
    trackLeadLeakDetectorEvent('lead_leak_detector_question_answered', {
      meta: {
        source_trigger: openSource,
        current_step: currentQuestionIndex + 1,
        score: option.score,
        leak: option.leak,
      },
    });

    if (currentQuestionIndex === content.questions.length - 1) {
      return;
    }

    setCurrentQuestionIndex((index) => index + 1);
  };

  const restartDetector = () => {
    setStarted(false);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setLeadCaptureMode(null);
    setLeadForm({ name: '', phone: '', company: '', email: '' });
    setLeadFormState({
      viewing: false,
      started: false,
      submitting: false,
      success: false,
      error: '',
      reportUrl: '',
    });
  };

  const openLeadCapture = (ctaType) => {
    setLeadCaptureMode(ctaType);
    setLeadFormState((prev) => ({
      ...prev,
      viewing: true,
      error: '',
      success: false,
      reportUrl: '',
    }));

    trackLeadLeakDetectorEvent(
      ctaType === 'full_report'
        ? 'lead_leak_detector_report_cta_click'
        : 'lead_leak_detector_demo_cta_click',
      {
        meta: {
          source_trigger: 'result_cta',
          cta_type: ctaType,
          score: resultPayload?.score,
          risk_level: resultPayload?.riskLevel,
          top_leaks: resultPayload?.topLeaks,
        },
      }
    );

    trackLeadLeakDetectorEvent('lead_leak_detector_lead_form_view', {
      meta: {
        cta_type: ctaType,
        score: resultPayload?.score,
        risk_level: resultPayload?.riskLevel,
        top_leaks: resultPayload?.topLeaks,
      },
    });
  };

  const handleLeadFieldFocus = () => {
    if (leadFormState.started) return;

    setLeadFormState((prev) => ({ ...prev, started: true }));
    trackLeadLeakDetectorEvent('lead_leak_detector_lead_form_start', {
      meta: {
        cta_type: leadCaptureMode,
        score: resultPayload?.score,
        risk_level: resultPayload?.riskLevel,
      },
    });
  };

  const handleLeadFieldChange = (key, value) => {
    setLeadForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLeadSubmit = async (event) => {
    event.preventDefault();
    if (!leadCaptureMode || !resultPayload) return;

    if (!leadForm.name.trim() || !leadForm.phone.trim()) {
      setLeadFormState((prev) => ({
        ...prev,
        error: 'Please add your name and phone number.',
      }));
      trackLeadLeakDetectorEvent('lead_leak_detector_lead_form_error', {
        meta: {
          cta_type: leadCaptureMode,
          score: resultPayload.score,
          risk_level: resultPayload.riskLevel,
          message: 'missing_required_fields',
        },
      });
      return;
    }

    setLeadFormState((prev) => ({
      ...prev,
      submitting: true,
      error: '',
    }));

    const metaOverrides = {
      source: 'lead_leak_detector',
      cta_type: leadCaptureMode,
      detector_score: resultPayload.score,
      detector_risk_level: resultPayload.riskLevel,
      detector_top_leaks: resultPayload.topLeaks,
      detector_answers: resultPayload.answers,
      company_name: leadForm.company.trim() || null,
      source_trigger: resultPayload.sourceTrigger,
      lead_leak_detector: {
        score: resultPayload.score,
        risk_level: resultPayload.riskLevel,
        top_leaks: resultPayload.topLeaks,
        answers: resultPayload.answers,
        advice: resultPayload.advice,
        cta_type: leadCaptureMode,
        source_trigger: resultPayload.sourceTrigger,
      },
    };

    const submitLabel =
      leadCaptureMode === 'full_report'
        ? 'Lead Leak Detector Report Request'
        : 'Lead Leak Detector Demo Request';

    trackLeadLeakDetectorEvent('lead_leak_detector_lead_form_submit', {
      meta: {
        cta_type: leadCaptureMode,
        score: resultPayload.score,
        risk_level: resultPayload.riskLevel,
        top_leaks: resultPayload.topLeaks,
      },
    });

    try {
      const response = await submitWebsiteLead({
        name: leadForm.name,
        phone: leadForm.phone,
        email: leadForm.email,
        message:
          leadCaptureMode === 'full_report'
            ? 'Requested the full Lead Leak Detector report.'
            : 'Requested a demo tailored to the Lead Leak Detector result.',
        service: 'Lead Leak Detector',
        itemId: null,
        formName: submitLabel,
        source: 'lead_leak_detector',
        metaOverrides,
      });

      setLeadFormState({
        viewing: true,
        started: true,
        submitting: false,
        success: true,
        error: '',
        reportUrl: leadCaptureMode === 'full_report' ? response?.report_url || '' : '',
      });

      trackLeadLeakDetectorEvent('lead_leak_detector_lead_form_success', {
        meta: {
          cta_type: leadCaptureMode,
          score: resultPayload.score,
          risk_level: resultPayload.riskLevel,
          top_leaks: resultPayload.topLeaks,
        },
      });
    } catch (error) {
      const message = error?.message || 'Unable to send your request right now.';
      setLeadFormState((prev) => ({
        ...prev,
        submitting: false,
        error: message,
      }));
      trackLeadLeakDetectorEvent('lead_leak_detector_lead_form_error', {
        meta: {
          cta_type: leadCaptureMode,
          score: resultPayload.score,
          risk_level: resultPayload.riskLevel,
          top_leaks: resultPayload.topLeaks,
          message,
        },
      });
    }
  };

  return (
    <>
      <section id="lead-leak-detector" className="px-6 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0c12] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] sm:px-6 sm:py-6 lg:px-7 lg:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(65,217,173,0.1),transparent_26%)]" />
            <div
              className="relative z-10 grid gap-4 lg:grid-cols-[minmax(0,0.98fr)_minmax(400px,1.02fr)] lg:items-center"
              onMouseEnter={() => setIsHeroCarouselPaused(true)}
              onMouseLeave={() => setIsHeroCarouselPaused(false)}
            >
              <div className="max-w-[44rem] lg:-translate-y-4">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  {activeHeroPanel?.eyebrow}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeHeroPanel?.key}-copy`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                  >
                    <h2 className="max-w-[19ch] text-[1.8rem] font-black leading-[1.04] tracking-tight text-white sm:max-w-[18ch] sm:text-[2.1rem] lg:max-w-[18ch] lg:text-[2.22rem]">
                      {activeHeroPanel?.headline}
                    </h2>
                    <p className="mt-3 max-w-[38rem] text-[13px] leading-6 text-slate-300 sm:text-[14px] sm:leading-6">
                      {activeHeroPanel?.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
                {activeHeroPanel?.variant === 'showcase' ? (
                  <div className="mt-5 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <button
                        type="button"
                        onClick={activeHeroPanel?.onClick}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_rgba(79,70,229,0.32)] transition hover:translate-y-[-1px]"
                      >
                        {activeHeroPanel?.buttonText}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-slate-400">
                          Mobile workspace for your team
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 text-[13px] text-slate-300">
                        {mobileAppBenefits.map((benefit) => (
                          <div key={benefit} className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-violet-300" />
                            <span>{benefit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(activeHeroPanel?.highlights || []).map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-[18px] py-3 text-[11px] text-slate-200"
                      >
                        <CheckCircle2 className="h-3 w-3 text-violet-300" />
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:ml-auto lg:w-full lg:max-w-[41rem]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={heroPanels[activeHeroPanelIndex]?.key}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.28 }}
                  >
                    {heroPanels[activeHeroPanelIndex]?.variant === 'showcase' ? (
                      <div className="space-y-3">
                        <div className="rounded-[1.25rem] border border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.08),transparent_36%),rgba(8,11,18,0.94)] p-3 shadow-[0_8px_18px_rgba(59,130,246,0.05)]">
                          <div className="mb-2.5 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[13px] font-semibold text-white sm:text-sm">{heroPanels[activeHeroPanelIndex]?.title}</p>
                              <p className="text-[11px] leading-5 text-slate-400">{heroPanels[activeHeroPanelIndex]?.subtitle}</p>
                            </div>
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                              Live Demo
                            </span>
                          </div>

                          <div className="overflow-hidden rounded-[1rem] border border-white/[0.06]">
                            <img
                              src={appPreviewSrc}
                              alt={heroPanels[activeHeroPanelIndex]?.title || 'Be Souhola mobile app showcase'}
                              className="pointer-events-none mx-auto block h-[230px] w-[85%] object-contain object-center select-none sm:h-[255px] lg:h-[285px]"
                              onError={(event) => {
                                resolveImageFallback(event, appShowcaseImage);
                                setAppPreviewSrc(appShowcaseImage);
                              }}
                            />
                          </div>

                        </div>

                        <p className="px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                          {content.appAvailabilityText}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 flex items-center gap-3">
                          <div className={`rounded-2xl border p-3 ${heroPanels[activeHeroPanelIndex]?.iconTone}`}>
                            {React.createElement(heroPanels[activeHeroPanelIndex]?.icon || Activity, {
                              className: 'h-5 w-5',
                            })}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{heroPanels[activeHeroPanelIndex]?.title}</p>
                            <p className="text-xs text-slate-400">{heroPanels[activeHeroPanelIndex]?.subtitle}</p>
                          </div>
                        </div>

                        {heroPanels[activeHeroPanelIndex]?.key === 'integrations' ? (
                          <div className="space-y-4">
                            <div className="rounded-[1.2rem] border border-cyan-400/10 bg-white/[0.03] p-4">
                              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                                <div className="flex flex-wrap gap-2">
                                  {heroPanels[activeHeroPanelIndex]?.bullets?.slice(0, 4).map((bullet) => (
                                    <span
                                      key={bullet.label}
                                      className="rounded-full border border-cyan-400/15 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100"
                                    >
                                      {bullet.label}
                                    </span>
                                  ))}
                                </div>
                                <div className="hidden justify-center text-cyan-200 sm:flex">
                                  <ArrowRight className="h-4 w-4" />
                                </div>
                                <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-4 text-center">
                                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-200">
                                    <Layers3 className="h-5 w-5" />
                                  </div>
                                  <p className="text-sm font-semibold text-white">Be Souhola CRM</p>
                                  <p className="mt-1 text-[11px] text-slate-300">All sources in one live pipeline</p>
                                </div>
                                <div className="hidden justify-center text-violet-200 sm:flex">
                                  <ArrowRight className="h-4 w-4" />
                                </div>
                                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-4 text-center">
                                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200">
                                    <Users className="h-5 w-5" />
                                  </div>
                                  <p className="text-sm font-semibold text-white">Sales Team</p>
                                  <p className="mt-1 text-[11px] text-slate-300">Assigned instantly and ready to follow up</p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3 text-sm text-slate-300">
                              {heroPanels[activeHeroPanelIndex]?.bullets?.slice(4, 6).map((bullet) => (
                                <div key={bullet.label} className="flex items-center gap-2">
                                  {React.createElement(bullet.icon || CheckCircle2, {
                                    className: `h-4 w-4 ${bullet.tone || 'text-violet-300'}`,
                                  })}
                                  {bullet.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 text-sm text-slate-300">
                            {heroPanels[activeHeroPanelIndex]?.bullets?.map((bullet) => (
                              <div key={bullet.label} className="flex items-center gap-2">
                                {React.createElement(bullet.icon || CheckCircle2, {
                                  className: `h-4 w-4 ${bullet.tone || 'text-violet-300'}`,
                                })}
                                {bullet.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {heroPanels[activeHeroPanelIndex]?.variant === 'showcase' ? null : (
                      <button
                        type="button"
                        onClick={heroPanels[activeHeroPanelIndex]?.onClick}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_rgba(79,70,229,0.32)] transition hover:translate-y-[-1px]"
                      >
                        {heroPanels[activeHeroPanelIndex]?.buttonText}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </motion.div>
                </AnimatePresence>

                {heroPanels.length > 1 ? (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                      Explore More
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {heroPanels.map((panel, index) => (
                        <button
                          key={`${panel.key}-label`}
                          type="button"
                          onClick={() => setActiveHeroPanelIndex(index)}
                          className={`rounded-full border px-3 py-1 text-[10px] font-medium transition ${
                            activeHeroPanelIndex === index
                              ? 'border-violet-300/40 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {panel.eyebrow}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      {heroPanels.map((panel, index) => (
                        <button
                          key={panel.key}
                          type="button"
                          aria-label={`Show ${panel.title}`}
                          onClick={() => setActiveHeroPanelIndex(index)}
                          className={`h-2.5 rounded-full transition-all ${
                            activeHeroPanelIndex === index
                              ? 'w-8 bg-violet-300 shadow-[0_0_18px_rgba(167,139,250,0.65)]'
                              : 'w-2.5 bg-white/25 hover:bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showFloatingTrigger && !isOpen ? (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25 }}
            type="button"
            onClick={() => openDetector('floating_button')}
            className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-[#12151f]/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
          >
            <Activity className="h-4 w-4 text-violet-300" />
            {content.floatingButtonText}
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(4,6,10,0.82)] p-4 backdrop-blur-md sm:p-6"
          >
            <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.98 }}
                transition={{ duration: 0.24 }}
                className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#090b11] shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,114,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(65,217,173,0.12),transparent_30%)]" />
                <button
                  type="button"
                  onClick={closeDetector}
                  className="absolute right-5 top-5 z-20 rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="relative z-10 p-6 sm:p-8 lg:p-10">
                  {!started ? (
                    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                      <div>
                        <div className="mb-4 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-violet-200">
                          {content.modalTitle}
                        </div>
                        <h3 className="max-w-[14ch] text-4xl font-black tracking-tight text-white sm:text-5xl">
                          Diagnose your sales pipeline before you buy a CRM.
                        </h3>
                        <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                          {content.modalSubtitle}
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            {content.modalNote}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-emerald-200">
                            <Target className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">What you will get</p>
                            <p className="text-xs text-slate-400">A fast, useful, result-first experience</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {content.items.map((item) => (
                            <div
                              key={item}
                              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[#10141d] px-4 py-3 text-sm text-slate-200"
                            >
                              <CheckCircle2 className="h-4 w-4 text-violet-300" />
                              {item}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={startDetector}
                          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(79,70,229,0.35)] transition hover:translate-y-[-1px]"
                        >
                          {content.modalStartText}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : result ? (
                    <div className="space-y-8">
                      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6">
                          <div className={`absolute inset-0 bg-gradient-to-br ${result.tone.glow}`} />
                          <div className="relative z-10">
                            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Sales Leakage Score</p>
                            <div className={`mt-4 text-6xl font-black ${result.tone.accent}`}>{result.score}/100</div>
                            <div className={`mt-4 inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${result.tone.chip}`}>
                              Risk level: {result.riskLabel}
                            </div>
                            <p className="mt-4 text-sm text-slate-300">
                              {content.estimatedLossLabel}: {result.estimatedLoss}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6">
                          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Top leakage points</p>
                          <div className="mt-5 space-y-3">
                            {result.topLeaks.map((item, index) => (
                              <div
                                key={item.key}
                                className="flex items-start gap-4 rounded-2xl border border-white/8 bg-[#10141d] px-4 py-4"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-200">
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-semibold text-white">{item.label}</p>
                                  <p className="mt-1 text-sm text-slate-400">{item.solution}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                          <div>
                            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{content.solutionHeading}</p>
                            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{content.reportPrompt}</p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => openLeadCapture('full_report')}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                            >
                              Get the full report
                              <ArrowRight className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLeadCapture('demo')}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(79,70,229,0.35)] transition hover:translate-y-[-1px]"
                            >
                              {content.resultCtaText}
                              <ArrowRight className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={restartDetector}
                              className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                            >
                              Run it again
                            </button>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                          {result.topLeaks.map((item) => (
                            <div key={`${item.key}-map`} className="rounded-2xl border border-white/8 bg-[#10141d] p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Detected issue</p>
                              <p className="mt-2 font-semibold text-white">{item.label}</p>
                              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">Be Souhola fix</p>
                              <p className="mt-2 text-sm leading-6 text-slate-300">{item.solution}</p>
                            </div>
                          ))}
                        </div>

                        <p className="mt-5 text-sm text-slate-400">{content.resultSecondaryText}</p>

                        {leadFormState.viewing ? (
                          <div className="mt-8 rounded-[1.75rem] border border-violet-400/20 bg-[linear-gradient(180deg,rgba(124,58,237,0.14),rgba(255,255,255,0.03))] p-5 sm:p-6">
                            {leadFormState.success ? (
                              <div className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm text-emerald-50">
                                <div className="flex items-start gap-3">
                                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                                  <div>
                                    <p className="font-semibold text-white">
                                      {leadCaptureMode === 'full_report'
                                        ? 'Your report is ready.'
                                        : 'Your tailored demo request has been sent.'}
                                    </p>
                                    <p className="mt-2 leading-7 text-emerald-100/90">
                                      We saved your sales leakage result with the request so the next conversation starts with context, not from zero.
                                    </p>
                                  </div>
                                </div>

                                {leadCaptureMode === 'full_report' ? (
                                  <div className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#0d1118]">
                                    <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        <p className="text-sm font-semibold text-white">Full report preview</p>
                                        <p className="text-xs text-emerald-100/70">
                                          The complete result is shown here and saved in the CRM attachments.
                                        </p>
                                      </div>
                                      {leadFormState.reportUrl ? (
                                        <a
                                          href={leadFormState.reportUrl}
                                          download={`sales-leakage-report-${result.score}.pdf`}
                                          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                        >
                                          Download report
                                        </a>
                                      ) : null}
                                    </div>
                                    <div className="grid gap-4 p-4 md:grid-cols-[0.9fr_1.1fr]">
                                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sales Leakage Score</p>
                                        <div className={`mt-3 text-5xl font-black ${result.tone.accent}`}>{result.score}/100</div>
                                        <div className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${result.tone.chip}`}>
                                          Risk level: {result.riskLabel}
                                        </div>
                                        <p className="mt-4 text-sm text-slate-300">
                                          {content.estimatedLossLabel}: {result.estimatedLoss}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Top leakage points</p>
                                        <div className="mt-3 space-y-3">
                                          {result.topLeaks.map((item, index) => (
                                            <div key={`${item.key}-report-${index}`} className="rounded-xl border border-white/8 bg-[#10141d] px-4 py-3">
                                              <p className="text-sm font-semibold text-white">{item.label}</p>
                                              <p className="mt-1 text-xs leading-6 text-slate-400">{item.solution}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="border-t border-white/10 p-4">
                                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Personalized recommendations</p>
                                      <div className="mt-3 grid gap-3">
                                        {result.advice.map((item, index) => (
                                          <div key={`${item.title}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                              <div>
                                                <p className="text-sm font-semibold text-white">{item.title}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                  Based on: {item.answer}
                                                </p>
                                              </div>
                                              <span className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                                                {item.priority}
                                              </span>
                                            </div>
                                            <p className="mt-3 text-sm leading-6 text-slate-300">{item.impact}</p>
                                            <p className="mt-3 text-sm leading-6 text-emerald-100/90">{item.recommendation}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="border-t border-white/10 p-4">
                                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Why Be Souhola is a strong fit</p>
                                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        {beSouholaSellingPoints.map((item) => (
                                          <div key={item.title} className="rounded-2xl border border-white/8 bg-[#10141d] p-4">
                                            <p className="text-sm font-semibold text-white">{item.title}</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <form onSubmit={handleLeadSubmit} className="space-y-5">
                                <div>
                                  <p className="text-sm uppercase tracking-[0.2em] text-violet-200">
                                    {leadCaptureMode === 'full_report' ? 'Full report request' : 'Result-based demo request'}
                                  </p>
                                  <h4 className="mt-2 text-2xl font-black tracking-tight text-white">
                                    {leadCaptureMode === 'full_report'
                                      ? 'Get your tailored leakage report'
                                      : 'Book a demo built around your result'}
                                  </h4>
                                  <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                                    Your result shows {result.topLeaks.length} likely leakage points. Leave your details and we will send the next step with your score, top leaks, and recommended fixes.
                                  </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label htmlFor="lead-leak-name" className="text-slate-200">
                                      Full name *
                                    </Label>
                                    <div className="relative">
                                      <User2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                                      <Input
                                        id="lead-leak-name"
                                        value={leadForm.name}
                                        onChange={(event) => handleLeadFieldChange('name', event.target.value)}
                                        onFocus={handleLeadFieldFocus}
                                        placeholder="John Doe"
                                        className="rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor="lead-leak-phone" className="text-slate-200">
                                      Phone number *
                                    </Label>
                                    <div className="relative">
                                      <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                                      <Input
                                        id="lead-leak-phone"
                                        value={leadForm.phone}
                                        onChange={(event) => handleLeadFieldChange('phone', event.target.value)}
                                        onFocus={handleLeadFieldFocus}
                                        placeholder="+20 100 000 0000"
                                        className="rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor="lead-leak-company" className="text-slate-200">
                                      Company name
                                    </Label>
                                    <div className="relative">
                                      <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                                      <Input
                                        id="lead-leak-company"
                                        value={leadForm.company}
                                        onChange={(event) => handleLeadFieldChange('company', event.target.value)}
                                        onFocus={handleLeadFieldFocus}
                                        placeholder="Your company"
                                        className="rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor="lead-leak-email" className="text-slate-200">
                                      Email address
                                    </Label>
                                    <div className="relative">
                                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                                      <Input
                                        id="lead-leak-email"
                                        type="email"
                                        value={leadForm.email}
                                        onChange={(event) => handleLeadFieldChange('email', event.target.value)}
                                        onFocus={handleLeadFieldFocus}
                                        placeholder="you@company.com"
                                        className="rounded-2xl border-white/10 bg-black/25 pl-11 text-white placeholder:text-white/35"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {leadFormState.error ? (
                                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                                    {leadFormState.error}
                                  </div>
                                ) : null}

                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                  <p className="text-xs leading-6 text-slate-400">
                                    We will attach your detector score, risk level, top leaks, and answers to this request so the follow-up is tailored to your exact result.
                                  </p>
                                  <button
                                    type="submit"
                                    disabled={leadFormState.submitting}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(79,70,229,0.35)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
                                  >
                                    {leadFormState.submitting ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Sending...
                                      </>
                                    ) : leadCaptureMode === 'full_report' ? (
                                      'Get the full report'
                                    ) : (
                                      'Book my tailored demo'
                                    )}
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-3xl">
                      <div className="mb-5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                            Question {currentQuestionIndex + 1} of {content.questions.length}
                          </p>
                          <h3 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                            {currentQuestion?.prompt}
                          </h3>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                          {progress}% complete
                        </div>
                      </div>

                      <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
                          initial={false}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="grid gap-3">
                        {currentQuestion?.options?.map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => handleAnswer(option)}
                            className="group rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-5 py-5 text-left transition hover:border-violet-300/30 hover:bg-violet-500/10"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-white">{option.label}</p>
                                <p className="mt-1 text-sm text-slate-400">
                                  {content.leakLabels[option.leak] || defaultLeakLabels[option.leak] || 'Pipeline leak'}
                                </p>
                              </div>
                              <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:text-violet-200" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default LeadLeakDetector;
