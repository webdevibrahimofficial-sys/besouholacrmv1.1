import React from 'react';
import LegalPageLayout from '@/components/LegalPageLayout';

const sections = [
  {
    title: 'Welcome',
    body: [
      'This Privacy Policy describes how Be Souhola collects, uses, stores, processes, and protects personal and business-related information in connection with Be Souhola CRM, including the mobile application, web application, website, and related services.',
      'By accessing or using Be Souhola CRM, you acknowledge that you have read and understood this Privacy Policy.',
    ],
  },
  {
    title: '1. Information We Collect',
    body: [
      'Be Souhola may collect information provided directly by users, organizations, and website visitors, including names, email addresses, phone numbers, company details, job titles, billing information, account credentials, and any information submitted through contact forms, demo requests, onboarding processes, or support channels.',
      'The Company may also collect technical and operational information such as IP addresses, browser type, device information, log records, interaction data, system events, and service usage metrics required for platform operation, analytics, support, and security monitoring.',
    ],
  },
  {
    title: '2. How Information Is Used',
    list: [
      'To create, maintain, and administer user accounts and customer organizations.',
      'To provide CRM functionality, onboarding, support, implementation, and service communications.',
      'To monitor service performance, maintain security, investigate misuse, and improve product functionality.',
      'To communicate with users regarding demos, inquiries, billing matters, operational notices, and legitimate business updates.',
      'To comply with applicable legal, contractual, regulatory, and security obligations.',
    ],
  },
  {
    title: '3. Cookies and Similar Technologies',
    body: [
      'Be Souhola may use cookies, local storage, and similar technologies to improve website functionality, remember user preferences, measure traffic, understand user behavior, and support analytics and performance monitoring.',
      'Users may manage such technologies through their browser or device settings. Disabling certain technologies may affect website performance or specific features.',
    ],
  },
  {
    title: '4. Sharing and Disclosure of Information',
    body: [
      'Be Souhola does not sell personal information. Information may be shared with trusted service providers, infrastructure partners, hosting providers, communication platforms, analytics providers, support tools, and other subprocessors where necessary to operate, secure, maintain, or improve the service.',
      'Information may also be disclosed if required by law, legal process, regulatory obligation, contract enforcement, security response, fraud prevention, or protection of the rights, property, and safety of Be Souhola, its customers, or others.',
    ],
  },
  {
    title: '5. Data Ownership and Customer Responsibility',
    body: [
      'Customer and lead data entered into Be Souhola CRM remains under the responsibility of the subscribing organization that controls or submits such data.',
      'Organizations are responsible for ensuring that data collected and entered into the system is obtained and processed lawfully and that appropriate notices, permissions, and consents are maintained where required.',
    ],
  },
  {
    title: '6. Data Retention',
    body: [
      'Be Souhola retains information only for as long as reasonably necessary to provide services, fulfill contractual obligations, maintain operational integrity, support lawful business purposes, resolve disputes, enforce agreements, and comply with applicable laws.',
    ],
  },
  {
    title: '7. Data Security',
    body: [
      'Be Souhola applies reasonable administrative, technical, and organizational safeguards designed to protect information against unauthorized access, misuse, alteration, disclosure, or loss. While the Company takes data protection seriously, no method of transmission, storage, or processing can be guaranteed as completely secure.',
    ],
  },
  {
    title: '8. User Rights',
    body: [
      'Depending on applicable law and the user’s jurisdiction, individuals may have rights relating to access, correction, deletion, restriction, objection, or portability of certain personal information.',
      'Requests may be submitted through the Company’s official contact channels. Be Souhola may require reasonable identity verification before responding to such requests.',
    ],
  },
  {
    title: '9. Third-Party Services',
    body: [
      'Be Souhola CRM and its website may integrate with or rely upon third-party services for hosting, analytics, messaging, payments, authentication, infrastructure, and operational support. Use of those services may also be subject to the policies and terms of the relevant third-party providers.',
    ],
  },
  {
    title: '10. Policy Updates',
    body: [
      'Be Souhola reserves the right to update this Privacy Policy at any time. Revised versions become effective upon publication on the official website unless otherwise stated.',
    ],
  },
  {
    title: '11. Contact Information',
    body: [
      'Be Souhola',
      'Website: https://www.besouhola.com',
      'Email: info@besouhola.com',
      'If you have questions regarding this Privacy Policy or Be Souhola’s information handling practices, you may contact the Company using the details above.',
    ],
  },
];

const Privacy = () => {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      accent="Policy"
      effectiveDate="June 2026"
      description="This Privacy Policy governs how Be Souhola CRM collects, uses, processes, stores, and protects personal and business-related information."
      sections={sections}
    />
  );
};

export default Privacy;
