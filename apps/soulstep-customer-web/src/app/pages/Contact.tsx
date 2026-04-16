'use client';

import { Link } from '@/lib/navigation';
import { useHead } from '@/lib/hooks/useHead';

const contactMethods = [
  {
    icon: 'mail',
    title: 'General Inquiries',
    description: 'Questions about SoulStep, partnership opportunities, or general feedback.',
    action: (
      <a
        href="mailto:contact@soul-step.org"
        className="text-sm text-primary hover:underline font-medium"
      >
        contact@soul-step.org
      </a>
    ),
  },
  {
    icon: 'bug_report',
    title: 'Bug Reports & Feedback',
    description:
      'Found a bug or have a feature request? Let us know so we can improve the platform.',
    action: (
      <a
        href="mailto:contact@soul-step.org"
        className="text-sm text-primary hover:underline font-medium"
      >
        contact@soul-step.org
      </a>
    ),
  },
  {
    icon: 'code',
    title: 'API & Developer Support',
    description:
      'Need help integrating with the SoulStep API or have questions about our data?',
    action: (
      <Link to="/developers" className="text-sm text-primary hover:underline font-medium">
        Visit the Developer Hub
      </Link>
    ),
  },
];

export default function Contact() {
  useHead({
    title: 'Contact Us',
    description:
      'Get in touch with the SoulStep team. Contact us for support, feedback, or partnership inquiries.',
    canonicalUrl: 'https://soul-step.org/contact',
    ogType: 'website',
    ogTitle: 'Contact SoulStep',
    ogDescription:
      'Reach out to the SoulStep team for support, feedback, or partnerships.',
    ogUrl: 'https://soul-step.org/contact',
    twitterCard: 'summary',
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text-main dark:text-white mb-3">Contact Us</h1>
      <p className="text-lg text-text-secondary dark:text-dark-text-secondary mb-8">
        Get in touch with the SoulStep team. We are here to help.
      </p>

      {/* Contact Methods */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          How to Reach Us
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {contactMethods.map((method) => (
            <div
              key={method.title}
              className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5 flex flex-col"
            >
              <span className="material-symbols-outlined text-primary text-3xl mb-3">
                {method.icon}
              </span>
              <h3 className="text-sm font-semibold text-text-main dark:text-white mb-1">
                {method.title}
              </h3>
              <p className="text-xs text-text-secondary dark:text-dark-text-secondary leading-relaxed mb-3 flex-1">
                {method.description}
              </p>
              {method.action}
            </div>
          ))}
        </div>
      </section>

      {/* Response Times */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">Response Times</h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary text-2xl mt-0.5">
              schedule
            </span>
            <div>
              <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                We aim to respond to all inquiries within{' '}
                <span className="font-semibold text-text-main dark:text-white">48 hours</span>.
                For urgent bug reports that affect site functionality, we prioritize faster
                turnaround. Please include as much detail as possible in your message to help us
                assist you quickly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source & Community */}
      <section>
        <h2 className="text-xl font-bold text-text-main dark:text-white mb-3">
          Community & Open Data
        </h2>
        <div className="rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface p-5">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-3">
            SoulStep is built on open data from sources like OpenStreetMap, Wikipedia, and Wikidata.
            We believe in making sacred sites data accessible to everyone — developers, researchers,
            and community builders alike.
          </p>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
            Interested in contributing or building on our data? Visit the{' '}
            <Link to="/developers" className="text-primary hover:underline font-medium">
              Developer Hub
            </Link>{' '}
            to learn about our public API, or reach out at{' '}
            <a
              href="mailto:contact@soul-step.org"
              className="text-primary hover:underline font-medium"
            >
              contact@soul-step.org
            </a>{' '}
            to discuss collaboration opportunities.
          </p>
        </div>
      </section>
    </div>
  );
}
