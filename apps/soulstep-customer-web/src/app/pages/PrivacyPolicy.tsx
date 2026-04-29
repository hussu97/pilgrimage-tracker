'use client';

import { useHead } from '@/lib/hooks/useHead';

export default function PrivacyPolicy() {
  useHead({
    title: 'Privacy Policy',
    description:
      'SoulStep privacy policy. Learn how we collect, use, and protect your data on our sacred sites discovery platform.',
    canonicalUrl: 'https://soul-step.org/privacy',
    ogType: 'website',
    ogTitle: 'Privacy Policy — SoulStep',
    ogDescription:
      'Learn how SoulStep collects, uses, and protects your data. Covers cookies, advertising, analytics, and your privacy rights.',
    ogUrl: 'https://soul-step.org/privacy',
    twitterCard: 'summary',
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text-main dark:text-white mb-3">Privacy Policy</h1>
      <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-8">
        Last updated: April 16, 2026
      </p>

      {/* 1. Introduction */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">1. Introduction</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            Welcome to SoulStep (<strong>soul-step.org</strong>). SoulStep is a pilgrimage and
            sacred sites discovery platform that helps users explore mosques, temples, churches,
            gurdwaras, synagogues, and other places of worship around the world. We enable users to
            create pilgrimage journeys, check in at sacred sites, write reviews, save favorites, and
            connect with fellow travelers on spiritual journeys.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            This Privacy Policy explains how we collect, use, disclose, and safeguard your
            information when you visit our website at{' '}
            <a href="https://soul-step.org" className="text-primary hover:underline">
              soul-step.org
            </a>{' '}
            on desktop or mobile web (collectively, the &quot;Service&quot;). Please read this
            policy carefully. By accessing or using the Service, you acknowledge that you have read,
            understood, and agree to be bound by this Privacy Policy.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            If you do not agree with the terms of this Privacy Policy, please do not access or use
            the Service. We reserve the right to make changes to this Privacy Policy at any time and
            for any reason. We will alert you about any changes by updating the &quot;Last
            updated&quot; date of this Privacy Policy.
          </p>
        </div>
      </section>

      {/* 2. Information We Collect */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          2. Information We Collect
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Account Information.</strong> When
            you register for a SoulStep account, we collect your name, email address, and password.
            You may optionally provide a profile photo and display name. If you sign in through a
            third-party authentication provider (such as Google), we receive your name, email
            address, and profile image from that provider.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Check-in and Activity Data.</strong>{' '}
            When you check in at a sacred site, we record the place, the timestamp, and any
            associated journey or group. We also store your reviews, ratings, favorite places, and
            journey progress. This data is used to personalize your experience, display your
            pilgrimage history, and calculate journey progress.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Location Data.</strong> With your
            permission, we collect your device&apos;s geographic location to show nearby sacred
            sites, enable proximity-based check-ins, and display your position on the discovery map.
            You can disable location services through your device or browser settings at any time,
            though this may limit certain features of the Service.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            <strong className="text-text-main dark:text-white">
              Device and Technical Information.
            </strong>{' '}
            We automatically collect certain information when you access the Service, including your
            IP address, browser type, operating system, device type, screen resolution, referring
            URL, and pages visited. This information is collected through our analytics provider
            (described in Section 5) and through standard server logs. We use this data to maintain
            the security and performance of the Service and to understand aggregate usage patterns.
          </p>
        </div>
      </section>

      {/* 3. How We Use Your Information */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          3. How We Use Your Information
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Service Operation.</strong> We use
            your information to create and manage your account, authenticate your identity, process
            check-ins, store your reviews and favorites, track journey progress, and deliver
            notifications. Your account data is essential for providing the core functionality of
            the Service.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Personalization.</strong> We use your
            check-in history, favorites, and location data to recommend sacred sites you may be
            interested in, suggest journeys, and display content relevant to your spiritual
            interests and geographic area. We may also use this data to personalize the order and
            presentation of places in search results and on the discovery map.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Analytics and Improvement.</strong>{' '}
            We analyze aggregate and anonymized usage data to understand how users interact with the
            Service, identify areas for improvement, fix bugs, and develop new features. We use
            Umami Cloud as our analytics provider, which is described in more detail in Section 5.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            <strong className="text-text-main dark:text-white">Communication.</strong> We may use
            your email address to send you service-related announcements, such as account
            verification, password reset, security alerts, and important updates to our Terms of
            Service or this Privacy Policy. We do not send marketing emails unless you have
            explicitly opted in.
          </p>
        </div>
      </section>

      {/* 4. Cookies and Advertising Technology */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          4. Cookies and Advertising Technology
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">
              Third-Party Advertising Cookies.
            </strong>{' '}
            We use Google AdSense (publisher ID: ca-pub-7902951158656200) to display advertisements
            on the Service. Third-party vendors, including Google, use cookies to serve ads based on
            your prior visits to this website and other websites on the Internet. Google&apos;s use
            of advertising cookies enables it and its partners to serve ads to you based on your
            visit to SoulStep and/or other sites on the Internet.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">
              Personalized Advertising and Opt-Out.
            </strong>{' '}
            Google may use the data collected through these cookies to personalize the
            advertisements shown to you. You may opt out of personalized advertising by visiting{' '}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google Ads Settings
            </a>
            . Alternatively, you may opt out of a third-party vendor&apos;s use of cookies for
            personalized advertising by visiting{' '}
            <a
              href="https://www.aboutads.info"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              www.aboutads.info
            </a>
            .
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Google Consent Mode v2.</strong> We
            implement Google Consent Mode v2 to respect your privacy choices. By default,
            advertising storage and analytics storage are set to &quot;denied&quot; until you
            provide explicit consent through our cookie consent banner. When consent is denied,
            Google tags adjust their behavior accordingly — no advertising cookies are stored, and
            ad personalization is disabled. If you grant consent, advertising and analytics cookies
            will function as described above. You may withdraw your consent at any time by clearing
            your browser cookies or using the consent controls provided on the Service.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            <strong className="text-text-main dark:text-white">Essential Cookies.</strong> In
            addition to advertising cookies, we use essential cookies that are strictly necessary
            for the operation of the Service. These include session cookies for authentication (to
            keep you logged in), language preference cookies, and theme preference cookies
            (light/dark mode). Essential cookies cannot be disabled as they are required for the
            Service to function properly.
          </p>
        </div>
      </section>

      {/* 5. Analytics */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">5. Analytics</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            We use{' '}
            <a
              href="https://umami.is"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Umami Cloud
            </a>{' '}
            as our web analytics provider. Umami is a privacy-focused analytics platform that does
            not use cookies, does not collect personal data, and does not track users across
            websites. All data collected by Umami is aggregated and anonymized — it cannot be used
            to identify individual users.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            Umami collects the following anonymized data points: page views, referrer URLs, browser
            type, operating system, device type, screen size, and country of origin (derived from IP
            address, which is not stored). This data helps us understand which pages are most
            visited, how users navigate the Service, and which devices and browsers we should
            prioritize for testing and optimization.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            Because Umami does not use cookies or collect personally identifiable information, it is
            compliant with GDPR, CCPA, and other privacy regulations without requiring cookie
            consent. Umami analytics data is entirely separate from the advertising cookies
            described in Section 4.
          </p>
        </div>
      </section>

      {/* 6. Data Sharing */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">6. Data Sharing</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">We do not sell your data.</strong>{' '}
            SoulStep does not sell, rent, or trade your personal information to third parties for
            their marketing purposes. We will never monetize your personal data directly.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Advertising Partners.</strong> As
            described in Section 4, we share data with Google and other advertising partners through
            cookies for the purpose of serving advertisements on the Service. This data may include
            browsing activity and cookie identifiers but does not include your name, email address,
            or other directly identifying account information.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            <strong className="text-text-main dark:text-white">Service Providers.</strong> We may
            share your information with third-party service providers who perform services on our
            behalf, such as hosting, data storage, email delivery, and customer support. These
            providers are contractually obligated to use your information only for the purposes of
            providing their services to us and are required to maintain the confidentiality of your
            data.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            <strong className="text-text-main dark:text-white">Legal Requirements.</strong> We may
            disclose your information if required to do so by law, in response to a valid legal
            process (such as a court order or subpoena), or when we believe in good faith that
            disclosure is necessary to protect our rights, protect your safety or the safety of
            others, investigate fraud, or respond to a government request.
          </p>
        </div>
      </section>

      {/* 7. Data Retention and Deletion */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          7. Data Retention and Deletion
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            We retain your account information, check-in history, reviews, and other user-generated
            content for as long as your account is active or as needed to provide you with the
            Service. If you stop using the Service but do not delete your account, we will retain
            your data in accordance with this policy and applicable law.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            You may request deletion of your account and all associated data at any time by
            contacting us at{' '}
            <a href="mailto:contact@soul-step.org" className="text-primary hover:underline">
              contact@soul-step.org
            </a>
            . Upon receiving a verified deletion request, we will delete your personal data from our
            active systems within 30 days. Some data may persist in encrypted backups for up to 90
            days after deletion, after which it will be permanently removed.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            Please note that certain data may be retained even after account deletion where required
            by law, to resolve disputes, enforce our agreements, or for legitimate business purposes
            such as fraud prevention. Anonymized and aggregated data that can no longer be
            associated with you may be retained indefinitely for analytical purposes.
          </p>
        </div>
      </section>

      {/* 8. Your Rights */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">8. Your Rights</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            Depending on your jurisdiction, you may have the following rights regarding your
            personal data:
          </p>
          <ul className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4 list-disc list-inside space-y-2">
            <li>
              <strong className="text-text-main dark:text-white">Right of Access:</strong> You may
              request a copy of the personal data we hold about you. You can access most of your
              data directly through the Service by visiting your profile and check-in history pages.
            </li>
            <li>
              <strong className="text-text-main dark:text-white">Right of Correction:</strong> You
              may update or correct your personal information at any time through the Edit Profile
              section of the Service, or by contacting us directly.
            </li>
            <li>
              <strong className="text-text-main dark:text-white">Right of Deletion:</strong> You may
              request the deletion of your personal data as described in Section 7 above.
            </li>
            <li>
              <strong className="text-text-main dark:text-white">Right to Opt Out:</strong> You may
              opt out of personalized advertising as described in Section 4. You may also opt out of
              non-essential communications by updating your notification preferences.
            </li>
            <li>
              <strong className="text-text-main dark:text-white">Right to Data Portability:</strong>{' '}
              You may request a machine-readable export of your personal data by contacting us.
            </li>
          </ul>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            To exercise any of these rights, please contact us at{' '}
            <a href="mailto:contact@soul-step.org" className="text-primary hover:underline">
              contact@soul-step.org
            </a>
            . We will respond to all legitimate requests within 30 days. We may ask you to verify
            your identity before processing your request to protect your account security.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            If you are a resident of the European Economic Area (EEA), you have the right to lodge a
            complaint with your local data protection authority if you believe your personal data
            has been processed in violation of applicable law. If you are a California resident, you
            have additional rights under the California Consumer Privacy Act (CCPA), including the
            right to know what personal information is collected, the right to delete it, and the
            right to opt out of the sale of personal information (which SoulStep does not engage
            in).
          </p>
        </div>
      </section>

      {/* 9. Children's Privacy */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          9. Children&apos;s Privacy
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            The Service is not intended for use by children under the age of 13. We do not knowingly
            collect personal information from children under 13. If we become aware that we have
            collected personal data from a child under 13 without verification of parental consent,
            we will take immediate steps to delete that information from our servers.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            If you are a parent or guardian and you believe your child under 13 has provided us with
            personal information, please contact us at{' '}
            <a href="mailto:contact@soul-step.org" className="text-primary hover:underline">
              contact@soul-step.org
            </a>{' '}
            so that we can take appropriate action. We encourage parents and guardians to monitor
            their children&apos;s Internet usage and to help enforce this Privacy Policy by
            instructing their children never to provide personal information through the Service
            without permission.
          </p>
        </div>
      </section>

      {/* 10. Changes to This Policy */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          10. Changes to This Policy
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            We may update this Privacy Policy from time to time to reflect changes in our practices,
            technologies, legal requirements, or other factors. When we make material changes, we
            will update the &quot;Last updated&quot; date at the top of this page and, where
            appropriate, provide additional notice such as an in-app notification or an email to
            your registered email address.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            We encourage you to review this Privacy Policy periodically to stay informed about how
            we are protecting your information. Your continued use of the Service after any changes
            to this Privacy Policy constitutes your acceptance of those changes. If you disagree
            with any updated terms, you should discontinue use of the Service and request deletion
            of your account.
          </p>
        </div>
      </section>

      {/* 11. Contact Us */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">11. Contact Us</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
            If you have any questions, concerns, or requests regarding this Privacy Policy or our
            data practices, please contact us at:
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
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
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            We take your privacy seriously and will make every effort to respond to your inquiry
            promptly. For data deletion or access requests, please allow up to 30 days for a
            complete response.
          </p>
        </div>
      </section>
    </div>
  );
}
