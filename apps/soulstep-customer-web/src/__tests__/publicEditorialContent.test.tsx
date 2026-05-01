import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  HomeEditorialContent,
  PlaceEditorialContent,
} from '../../app/(main)/_components/PublicEditorialContent';

describe('public editorial content', () => {
  it('renders crawl-visible homepage guidance', () => {
    const html = renderToStaticMarkup(<HomeEditorialContent />);

    expect(html).toContain('A practical guide to discovering sacred places');
    expect(html).toContain('Respect first');
    expect(html).not.toContain('display:none');
  });

  it('renders a crawl-visible place guide from place metadata', () => {
    const html = renderToStaticMarkup(
      <PlaceEditorialContent
        place={{
          place_code: 'plc_test',
          name: 'Test Mosque',
          religion: 'islam',
          place_type: 'mosque',
          city: 'Dubai',
          country: 'United Arab Emirates',
          address: '1 Main Street',
          lat: 25.2,
          lng: 55.3,
        }}
      />,
    );

    expect(html).toContain('About Test Mosque');
    expect(html).toContain('Dubai, United Arab Emirates');
    expect(html).toContain('confirm local access rules');
  });
});
