import React from 'react';
import LegalPageLayout from '@/components/LegalPageLayout';

const sections = [
  {
    title: 'Welcome',
    body: [
      'This Data Processing & Security Statement outlines the general principles followed by Be Souhola in relation to the processing, handling, hosting, confidentiality, and protection of customer and operational data within Be Souhola CRM.',
      'This statement is intended to provide current and prospective business customers with a clear and professional overview of Be Souhola’s service-provider role in relation to data and security.',
    ],
  },
  {
    title: '1. Scope of Processing',
    body: [
      'Be Souhola CRM processes business and customer-related information submitted by authorized users and subscribed organizations for the purpose of providing CRM functionality, sales workflow management, reporting, follow-up operations, support, implementation, system administration, and related service features.',
    ],
  },
  {
    title: '2. Roles of the Parties',
    body: [
      'In the ordinary course of service usage, the subscribing organization acts as the owner and controller of the customer or business data entered into the platform.',
      'Be Souhola generally acts as a service provider or processor, using such data solely to provide, host, maintain, support, secure, and improve the contracted services, subject to applicable legal and contractual obligations.',
    ],
  },
  {
    title: '3. Categories of Data Processed',
    list: [
      'Lead, customer, and contact information submitted by users or organizations.',
      'Sales pipeline records, tasks, notes, actions, communications, and workflow history.',
      'User account, permissions, configuration, and organization setup information.',
      'Technical logs, service events, audit records, and operational metadata required for security, support, and performance review.',
    ],
  },
  {
    title: '4. Processing Principles',
    list: [
      'Data is processed only for legitimate service delivery, operational, support, contractual, and security purposes.',
      'Access to data is limited to authorized personnel, approved subprocessors, and service roles with a legitimate need to know.',
      'Be Souhola seeks to minimize unnecessary access, exposure, and retention of customer-related information.',
      'Requests related to data retention, correction, export, deletion, or operational handling may be supported where contractually, legally, and technically applicable.',
    ],
  },
  {
    title: '5. Security Measures',
    list: [
      'Role-based access control and permission management within the platform.',
      'Authentication and credential-related safeguards intended to reduce unauthorized access risk.',
      'Operational logging and monitoring practices that support service review, issue resolution, and abuse detection.',
      'Reasonable technical and organizational controls designed to support confidentiality, integrity, and availability of data and systems.',
      'Use of selected infrastructure, hosting, backup, analytics, communication, and support providers where necessary for service operation.',
    ],
  },
  {
    title: '6. Confidentiality',
    body: [
      'Access to customer-related data is limited to authorized employees, contractors, or providers who require such access for implementation, support, maintenance, security, troubleshooting, or legitimate operational purposes and who are subject to confidentiality and professional obligations.',
    ],
  },
  {
    title: '7. Subprocessors and Third-Party Providers',
    body: [
      'Be Souhola may rely on third-party providers for hosting, storage, infrastructure, communication, backups, analytics, or service support. Such providers are selected according to operational suitability and are expected to support reasonable confidentiality and security obligations in connection with the services they provide.',
    ],
  },
  {
    title: '8. Incident Handling',
    body: [
      'Be Souhola maintains internal practices for identifying, assessing, containing, documenting, and responding to suspected security incidents affecting service operation or data protection. Where required by applicable law, contract, or operational necessity, affected customers may be informed through appropriate channels.',
    ],
  },
  {
    title: '9. Retention and Deletion',
    body: [
      'Customer-related information is retained according to business needs, contractual obligations, support requirements, legal obligations, service continuity considerations, and operational constraints. Where deletion or removal is required and feasible, Be Souhola will seek to remove, anonymize, or limit retention in accordance with technical and operational realities.',
    ],
  },
  {
    title: '10. Customer Responsibilities',
    list: [
      'Ensure that data entered into the CRM is collected, used, and processed lawfully.',
      'Control internal user access and remove access for unauthorized or former personnel without delay.',
      'Apply suitable internal password, confidentiality, and security practices within the customer organization.',
      'Review and manage any organization-specific compliance, privacy, or retention obligations that apply to its own business activities.',
    ],
  },
  {
    title: '11. Further Information',
    body: [
      'Organizations requiring additional contractual, onboarding, or compliance-related information may contact Be Souhola through the official website for further discussion of security, operations, or commercial documentation.',
    ],
  },
  {
    title: '12. Contact Information',
    body: [
      'Be Souhola',
      'Website: https://www.besouhola.com',
      'Email: info@besouhola.com',
    ],
  },
];

const DataProcessingSecurity = () => {
  return (
    <LegalPageLayout
      title="Data Processing & Security Statement"
      accent="Statement"
      canonicalPath="/data-processing-security"
      seoKey="data_processing_security"
      effectiveDate="June 2026"
      description="This statement describes the general principles applied by Be Souhola CRM in connection with data processing, confidentiality, hosting, and security."
      sections={sections}
    />
  );
};

export default DataProcessingSecurity;
