import React from 'react';
import LegalPageLayout from '@/components/LegalPageLayout';

const sections = [
  {
    title: 'Welcome',
    body: [
      'Welcome to Be Souhola CRM. These Terms & Conditions govern the use of the Be Souhola CRM mobile application, web application, and related services provided by Be Souhola.',
      'By accessing or using the application, you agree to comply with and be bound by these Terms & Conditions.',
    ],
  },
  {
    title: '1. Definitions',
    list: [
      '“Company” refers to Be Souhola.',
      '“Application” refers to Be Souhola CRM, including its mobile and web versions.',
      '“User” refers to any individual authorized to access the system by a valid account issued through Be Souhola or an authorized client organization.',
      '“Organization” refers to the company or entity subscribed to Be Souhola CRM services.',
    ],
  },
  {
    title: '2. Eligibility and Access',
    body: [
      'Access to the Application is restricted to authorized users only.',
      'Users must possess valid login credentials, use the system for legitimate business purposes, and maintain the confidentiality of their account information.',
      'The Company reserves the right to suspend or terminate access for unauthorized use or violations of these Terms.',
    ],
  },
  {
    title: '3. Account Security',
    list: [
      'Protecting their username and password.',
      'Preventing unauthorized access to their accounts.',
      'Immediately reporting any suspected security breach.',
    ],
    body: [
      'Users are responsible for the following account security measures.',
      'The Company is not responsible for losses resulting from a user’s failure to safeguard account credentials.',
    ],
  },
  {
    title: '4. Acceptable Use',
    list: [
      'Use the Application for unlawful activities.',
      'Attempt unauthorized access to any system or data.',
      'Interfere with the operation, security, or performance of the Application.',
      'Upload malicious code, viruses, or harmful content.',
      'Copy, distribute, reverse engineer, or exploit any part of the Application without written permission.',
    ],
    body: [
      'Users agree not to engage in any of the following actions.',
    ],
  },
  {
    title: '5. Data Ownership',
    body: [
      'Customer data entered into the system remains the property of the subscribing organization.',
      'Be Souhola acts as a service provider responsible for hosting, processing, and securing the data in accordance with applicable laws and the Privacy Policy.',
    ],
  },
  {
    title: '6. Permissions and Device Access',
    list: [
      'Location services.',
      'Photos and media files.',
      'Contacts.',
    ],
    body: [
      'The Application may request access to the following permissions.',
      'Such permissions are used solely to provide application functionality and improve user experience.',
      'Users may manage permissions through their device settings, although disabling certain permissions may affect specific features.',
    ],
  },
  {
    title: '7. Intellectual Property',
    body: [
      'All software, source code, trademarks, logos, designs, content, and related materials associated with Be Souhola CRM remain the exclusive property of Be Souhola.',
      'No rights or licenses are granted except as expressly stated in these Terms.',
    ],
  },
  {
    title: '8. Service Availability',
    list: [
      'Maintenance activities.',
      'Security updates.',
      'Technical issues beyond the Company’s reasonable control.',
    ],
    body: [
      'The Company strives to maintain continuous service availability but does not guarantee uninterrupted operation.',
      'Temporary interruptions may occur due to the following reasons.',
    ],
  },
  {
    title: '9. Limitation of Liability',
    list: [
      'Indirect or consequential damages.',
      'Loss of profits or business opportunities.',
      'Data loss caused by user actions, third-party services, or circumstances beyond reasonable control.',
    ],
    body: [
      'To the maximum extent permitted by applicable law, Be Souhola shall not be liable for the following.',
    ],
  },
  {
    title: '10. Privacy',
    body: [
      'Use of the Application is also governed by the Be Souhola CRM Privacy Policy.',
      'Users agree to the collection and processing of information as described in that policy.',
    ],
  },
  {
    title: '11. Suspension and Termination',
    list: [
      'These Terms are violated.',
      'Security risks are identified.',
      'Subscription agreements expire or are terminated.',
    ],
    body: [
      'The Company may suspend or terminate access if any of the following occurs.',
    ],
  },
  {
    title: '12. Modifications',
    body: [
      'Be Souhola reserves the right to modify these Terms & Conditions at any time.',
      'Updated versions will become effective upon publication on the official website.',
    ],
  },
  {
    title: '13. Governing Law',
    body: [
      'These Terms shall be governed and interpreted in accordance with the laws applicable in the jurisdiction where Be Souhola operates.',
    ],
  },
  {
    title: '14. Contact Information',
    body: [
      'Be Souhola',
      'Website: https://www.besouhola.com',
      'Email: info@besouhola.com',
      'By using Be Souhola CRM, you acknowledge that you have read, understood, and agreed to these Terms & Conditions.',
    ],
  },
];

const Terms = () => {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      accent="Conditions"
      canonicalPath="/terms"
      effectiveDate="June 2026"
      description="These Terms & Conditions govern the use of the Be Souhola CRM mobile application, web application, and related services provided by Be Souhola."
      sections={sections}
    />
  );
};

export default Terms;
