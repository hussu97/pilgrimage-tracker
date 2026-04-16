'use client';

import { Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';

export default function TermsOfService() {
  useHead({
    title: 'Terms of Service',
    description:
      'SoulStep terms of service. Read our terms for using the sacred sites discovery platform.',
    canonicalUrl: 'https://soul-step.org/terms',
    ogType: 'website',
    ogTitle: 'Terms of Service — SoulStep',
    ogDescription:
      'Read the terms and conditions for using SoulStep, the sacred sites discovery platform.',
    ogUrl: 'https://soul-step.org/terms',
    twitterCard: 'summary',
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text-main dark:text-white mb-3">Terms of Service</h1>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-8">
        Last updated: April 16, 2026
      </p>

      {/* 1. Acceptance of Terms */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          1. Acceptance of Terms
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            Welcome to SoulStep. By accessing or using the SoulStep website at{' '}
            <a href="https://soul-step.org" className="text-primary hover:underline">
              soul-step.org
            </a>{' '}
            and our mobile applications (collectively, the &quot;Service&quot;), you agree to be
            bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms,
            you may not access or use the Service.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            These Terms constitute a legally binding agreement between you and SoulStep. By creating
            an account, checking in at a location, submitting a review, or otherwise using any
            feature of the Service, you acknowledge that you have read, understood, and agree to be
            bound by these Terms, along with our{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            , which is incorporated by reference.
          </p>
        </div>
      </section>

      {/* 2. Description of Service */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          2. Description of Service
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            SoulStep is a sacred sites discovery platform that enables users to explore mosques,
            temples, churches, gurdwaras, synagogues, and other houses of worship worldwide. The
            Service allows you to discover sacred sites across multiple religions, check in at
            locations you visit, write and read reviews from fellow travelers, save favorite places,
            create journey groups, and plan pilgrimages with friends and family.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            The Service is available through our website and mobile applications for iOS and
            Android. While the core discovery features are available without an account, certain
            features such as check-ins, reviews, favorites, journey groups, and notifications
            require a registered account.
          </p>
        </div>
      </section>

      {/* 3. User Accounts */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">3. User Accounts</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            To access certain features of the Service, you must create an account by providing your
            name, email address, and a password. You are responsible for maintaining the
            confidentiality of your account credentials and for all activities that occur under your
            account. You agree to provide accurate and complete information during registration and
            to keep your account information up to date.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            Each person may maintain only one account. Creating multiple accounts for the purpose of
            manipulating reviews, check-in counts, journey leaderboards, or any other Service
            feature is prohibited and may result in the suspension or termination of all associated
            accounts.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            You must notify us immediately at{' '}
            <a href="mailto:contact@soul-step.org" className="text-primary hover:underline">
              contact@soul-step.org
            </a>{' '}
            if you suspect any unauthorized use of your account. SoulStep is not liable for any loss
            or damage arising from your failure to protect your account credentials.
          </p>
        </div>
      </section>

      {/* 4. User-Generated Content */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          4. User-Generated Content
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            The Service allows you to submit content including reviews, ratings, and journey
            descriptions (collectively, &quot;User Content&quot;). By submitting User Content, you
            grant SoulStep a worldwide, non-exclusive, royalty-free, perpetual license to use,
            display, reproduce, and distribute your User Content in connection with the operation of
            the Service. This license continues even if you delete your account, to the extent that
            your User Content has been shared with or relied upon by other users.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            You represent and warrant that your User Content is truthful, based on genuine personal
            experience, and does not infringe on the intellectual property or other rights of any
            third party. Reviews must reflect your honest assessment of the place you visited. Fake
            reviews, reviews of places you have not visited, and reviews submitted in exchange for
            compensation or incentives are prohibited.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            User Content must not contain hate speech, incitement to violence, threats,
            discriminatory language targeting any religion, ethnicity, or group, sexually explicit
            material, spam, advertising, or any content that violates applicable law. We reserve the
            right to remove any User Content that violates these Terms or that we consider
            inappropriate, without prior notice.
          </p>
        </div>
      </section>

      {/* 5. Acceptable Use */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">5. Acceptable Use</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            You agree to use the Service only for lawful purposes and in accordance with these
            Terms. You agree not to:
          </p>
          <ul className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4 list-disc list-inside space-y-2">
            <li>
              Scrape, crawl, or use automated tools to extract data from the Service without written
              permission (the public API at{' '}
              <Link to="/developers" className="text-primary hover:underline">
                /developers
              </Link>{' '}
              is the authorized method for programmatic access)
            </li>
            <li>
              Impersonate another person or entity, or misrepresent your affiliation with any person
              or entity
            </li>
            <li>
              Harass, threaten, or intimidate other users, religious communities, or site
              administrators
            </li>
            <li>
              Interfere with or disrupt the Service, its servers, or networks connected to the
              Service
            </li>
            <li>
              Attempt to gain unauthorized access to any part of the Service, other user accounts,
              or any systems or networks connected to the Service
            </li>
            <li>
              Use the Service to promote commercial products, services, or political campaigns
              without prior written approval
            </li>
          </ul>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            SoulStep is a platform dedicated to respectful exploration of sacred sites across all
            religions. We expect users to treat all religious traditions, communities, and sacred
            places with dignity and respect. Content or behavior that disrespects, mocks, or
            deliberately provokes any religious community is strictly prohibited.
          </p>
        </div>
      </section>

      {/* 6. Intellectual Property */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          6. Intellectual Property
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            The SoulStep platform, including its design, code, branding, logos, and documentation,
            is the property of SoulStep and is protected by applicable intellectual property laws.
            You may not copy, modify, distribute, or create derivative works of any part of the
            Service without our express written permission.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            Place data displayed on the Service is sourced from third-party providers including
            Google Maps, OpenStreetMap, Wikipedia, and Wikidata, and is subject to their respective
            licenses and terms of use. SoulStep does not claim ownership of third-party place data.
            The public API provides access to this data under the{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Creative Commons Attribution 4.0
            </a>{' '}
            license with attribution to SoulStep.
          </p>
        </div>
      </section>

      {/* 7. Advertising */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">7. Advertising</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            The Service displays third-party advertisements served through Google AdSense. These
            advertisements help support the operation and development of SoulStep. The content of
            third-party advertisements is not controlled by SoulStep, and we are not responsible for
            the accuracy, content, or practices of advertisers or the products and services they
            promote.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            You may manage your advertising preferences and opt out of personalized ads through our
            consent banner or by visiting{' '}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google Ads Settings
            </a>
            . For more details about how advertising data is collected and used, please see our{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            Use of ad-blocking software may affect the display of certain content or features of the
            Service. We do not restrict access to the Service based on the use of ad blockers, but
            some ad-supported features may not function as intended.
          </p>
        </div>
      </section>

      {/* 8. Disclaimers */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">8. Disclaimers</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
            WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            SoulStep does not guarantee the accuracy, completeness, or timeliness of place
            information displayed on the Service, including but not limited to opening hours,
            addresses, contact information, prayer times, and directions. Place data is sourced from
            third-party providers and user contributions, and may contain errors or become outdated.
            You should always verify critical information (such as opening hours and accessibility)
            directly with the place before visiting.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            SoulStep is not affiliated with, endorsed by, or responsible for any of the religious
            sites, organizations, or communities listed on the Service. The inclusion of a place on
            SoulStep does not constitute an endorsement or recommendation. User reviews and ratings
            reflect the opinions of individual users and do not represent the views of SoulStep.
          </p>
        </div>
      </section>

      {/* 9. Limitation of Liability */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          9. Limitation of Liability
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SOULSTEP AND ITS OFFICERS, DIRECTORS,
            EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA,
            USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, WHETHER
            BASED ON WARRANTY, CONTRACT, TORT, OR ANY OTHER LEGAL THEORY.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            In no event shall SoulStep&apos;s total aggregate liability to you for all claims
            arising from or related to your use of the Service exceed the greater of fifty United
            States dollars (US$50) or the total amount you have paid to SoulStep (if any) during the
            twelve months preceding the claim.
          </p>
        </div>
      </section>

      {/* 10. Termination */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">10. Termination</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            We reserve the right to suspend or terminate your account and access to the Service at
            any time, with or without notice, for any reason, including but not limited to violation
            of these Terms. Upon termination, your right to use the Service will immediately cease,
            and we may delete your account data in accordance with our{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            You may terminate your account at any time by contacting us at{' '}
            <a href="mailto:contact@soul-step.org" className="text-primary hover:underline">
              contact@soul-step.org
            </a>
            . All provisions of these Terms which by their nature should survive termination shall
            survive, including ownership provisions, warranty disclaimers, and limitations of
            liability.
          </p>
        </div>
      </section>

      {/* 11. Changes to Terms */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          11. Changes to Terms
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            We reserve the right to modify these Terms at any time. When we make material changes,
            we will update the &quot;Last updated&quot; date at the top of this page and may provide
            additional notice through the Service. Your continued use of the Service after any
            changes to these Terms constitutes your acceptance of the revised Terms.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            If you disagree with any changes, you should discontinue use of the Service and request
            deletion of your account. We encourage you to review these Terms periodically.
          </p>
        </div>
      </section>

      {/* 12. Governing Law */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">12. Governing Law</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            These Terms shall be governed by and construed in accordance with applicable laws,
            without regard to conflict of law principles. Any disputes arising out of or relating to
            these Terms or the Service shall first be attempted to be resolved through good-faith
            negotiation. If a resolution cannot be reached, disputes shall be submitted to binding
            arbitration or the courts of competent jurisdiction.
          </p>
        </div>
      </section>

      {/* 13. Contact */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">13. Contact</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            If you have any questions about these Terms, please contact us at:
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            <strong className="text-text-main dark:text-white">SoulStep</strong>
            <br />
            Email:{' '}
            <a href="mailto:contact@soul-step.org" className="text-primary hover:underline">
              contact@soul-step.org
            </a>
            <br />
            Website:{' '}
            <a href="https://soul-step.org" className="text-primary hover:underline">
              soul-step.org
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
