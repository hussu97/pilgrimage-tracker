import type { ReactNode } from 'react';
import type { CityMeta, PlaceForMeta } from '@/lib/server/api';

function EditorialShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const headingId = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return (
    <section className="mx-auto my-10 w-full max-w-6xl px-4 lg:px-6" aria-labelledby={headingId}>
      <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-soft dark:border-dark-border dark:bg-dark-surface lg:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 text-2xl font-bold text-text-main dark:text-white lg:text-3xl"
        >
          {title}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-text-secondary dark:text-dark-text-secondary lg:text-base">
          {intro}
        </p>
        <div className="mt-6 grid gap-5 text-sm leading-7 text-slate-700 dark:text-dark-text-secondary lg:grid-cols-3 lg:text-base">
          {children}
        </div>
      </div>
    </section>
  );
}

export function HomeEditorialContent() {
  return (
    <EditorialShell
      eyebrow="Sacred travel guide"
      title="A practical guide to discovering sacred places"
      intro="SoulStep is built for travelers who want more than a pin on a map. Every place page is designed to combine spiritual context, visitor basics, location data, photos, reviews, and journey tools so people can plan respectful visits to houses of worship and heritage sites."
    >
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">What you can discover</h3>
        <p className="mt-2">
          Explore mosques, temples, churches, gurdwaras, synagogues, Buddhist monasteries, Baha'i
          houses of worship, Zoroastrian fire temples, and other sacred sites. SoulStep organizes
          these places by city, religion, rating, opening status, and nearby context so visitors can
          move from broad discovery to a specific itinerary with less guesswork.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Why the data matters</h3>
        <p className="mt-2">
          Sacred sites are often described differently across maps, local guides, and community
          sources. SoulStep keeps structured fields for address, coordinates, descriptions, images,
          reviews, and place type so travelers can compare options clearly and avoid wasting time on
          incomplete listings.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Built for real journeys</h3>
        <p className="mt-2">
          Visitors can save places, check in, write reviews, and group stops into shared journeys.
          The goal is to support pilgrimages, family trips, architecture walks, interfaith learning,
          and everyday local discovery while keeping the experience simple on mobile and desktop.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Respect first</h3>
        <p className="mt-2">
          SoulStep treats sacred sites as living community spaces, not just attractions. We
          encourage visitors to confirm local rules, dress expectations, photography guidance, and
          service times before arriving, especially when visiting an active house of worship.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Useful over noisy</h3>
        <p className="mt-2">
          The best pages help someone make a real decision. That means clear names, useful
          descriptions, accurate coordinates, recent photos, and reviews that explain practical
          details instead of generic praise.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">A global catalog</h3>
        <p className="mt-2">
          SoulStep is expanding across regions while keeping the same standard for each listing:
          enough context to understand the place, enough data to find it, and enough visitor signal
          to decide whether it belongs in your route.
        </p>
      </div>
    </EditorialShell>
  );
}

export function PlacesEditorialContent() {
  return (
    <EditorialShell
      eyebrow="Browse verified places"
      title="How to use the SoulStep sacred sites directory"
      intro="The places directory is the fastest way to scan SoulStep's catalog of worship sites and spiritual landmarks. It is designed for people who already know the type of place they want, but still need enough context to choose where to go next."
    >
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Filter with intent</h3>
        <p className="mt-2">
          Start with a religion, city, or search phrase, then compare the visible details on each
          listing. Strong listings include a useful name, address, photos, rating information, and a
          description that explains what the site is known for.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Check visitor signals</h3>
        <p className="mt-2">
          Ratings, reviews, check-ins, images, and opening information are all treated as visitor
          signals. They help separate active, useful pages from thin listings and make it easier to
          decide whether a place is worth adding to a journey.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Go deeper on each page</h3>
        <p className="mt-2">
          Place detail pages add richer descriptions, practical location context, photos, related
          sites, nearby recommendations, and frequently asked questions when available. The
          directory is only the starting point; the detail page is where planning happens.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Quality before quantity</h3>
        <p className="mt-2">
          A large directory is only useful when the listings are understandable. SoulStep highlights
          places with meaningful names, good geographic data, and enough visitor information to
          avoid thin or confusing pages.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Designed for comparison</h3>
        <p className="mt-2">
          Directory browsing is built around comparison: which places are near each other, which
          tradition they belong to, whether they have images, and whether other visitors left useful
          guidance.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">From search to visit</h3>
        <p className="mt-2">
          Once a place looks promising, save it or add it to a journey. SoulStep is meant to turn
          research into an actual route, with enough structure to support both solo visits and group
          planning.
        </p>
      </div>
    </EditorialShell>
  );
}

export function ExploreEditorialContent() {
  return (
    <EditorialShell
      eyebrow="Explore by city"
      title="Plan sacred-site visits city by city"
      intro="City exploration helps travelers understand the spiritual landscape of a destination before they arrive. Instead of treating every place as an isolated listing, SoulStep groups nearby places into city-level guides that reveal patterns across faith traditions and neighborhoods."
    >
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Choose a destination</h3>
        <p className="mt-2">
          Use city pages when you are planning a trip, moving through a new neighborhood, or looking
          for a respectful way to learn about local religious heritage. City filters make it easier
          to compare nearby temples, mosques, churches, gurdwaras, synagogues, and monasteries.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Compare traditions</h3>
        <p className="mt-2">
          SoulStep supports multiple faith traditions in the same interface. That matters because
          many cities have layered histories where sacred sites sit close together, and travelers
          often want to understand the wider spiritual character of the place.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">
          Move from research to route
        </h3>
        <p className="mt-2">
          Once a city looks interesting, open individual place pages, save the strongest candidates,
          and build a journey. The app is meant to connect discovery, planning, and on-the-ground
          visits without forcing people to rebuild the same list in multiple tools.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">
          Read the city through places
        </h3>
        <p className="mt-2">
          Sacred sites often reveal migration, architecture, community history, and neighborhood
          identity. Exploring by city helps travelers see those connections instead of treating each
          listing as a disconnected stop.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">
          Balance distance and meaning
        </h3>
        <p className="mt-2">
          The closest place is not always the best place for a journey. Compare descriptions,
          ratings, photos, and tradition-specific context so the route matches your purpose, timing,
          and comfort level.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Keep plans flexible</h3>
        <p className="mt-2">
          Opening hours, service schedules, and visitor access can change. SoulStep gives you a
          planning base, but a respectful route still leaves room to confirm details and adjust on
          the day.
        </p>
      </div>
    </EditorialShell>
  );
}

export function BlogEditorialContent() {
  return (
    <EditorialShell
      eyebrow="Editorial library"
      title="Guides for thoughtful spiritual travel"
      intro="SoulStep's editorial library explains how to plan sacred-site visits with context and respect. Articles are intended to complement the place directory by adding route ideas, etiquette notes, cultural background, and practical planning advice."
    >
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Before you visit</h3>
        <p className="mt-2">
          Learn how to check prayer or service times, dress expectations, photography norms, entry
          rules, and quiet hours before arriving. A few minutes of preparation can make a visit more
          respectful for local communities and more meaningful for travelers.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">During the journey</h3>
        <p className="mt-2">
          Our guides encourage slower exploration: read the history, notice the architecture, follow
          posted guidance, and leave useful reviews for future visitors. Good travel content should
          improve the real-world visit, not just fill a search page.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">After the visit</h3>
        <p className="mt-2">
          Save notes, upload helpful photos where allowed, and group places into journeys that can
          be shared with family or friends. The best community data comes from people who actually
          visited and can add practical, grounded details.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Original context</h3>
        <p className="mt-2">
          The blog is meant to add context that a simple directory card cannot carry: why a route is
          meaningful, what visitors should prepare for, and how different traditions shape the
          experience of a place.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Practical detail</h3>
        <p className="mt-2">
          Strong guides should answer practical questions before a traveler is standing at the gate:
          when to go, how to behave respectfully, what to look for, and how to avoid common planning
          mistakes.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Connected to places</h3>
        <p className="mt-2">
          Articles and place pages work together. A guide can explain the bigger story, while each
          listing provides the specific address, photos, reviews, and journey actions needed to make
          the visit happen.
        </p>
      </div>
    </EditorialShell>
  );
}

export function CityEditorialContent({ city, religion }: { city: CityMeta; religion?: string }) {
  const cityName = city.city || city.city_slug.replace(/-/g, ' ');
  const religionLabel = religion ? `${religion.charAt(0).toUpperCase()}${religion.slice(1)}` : '';
  const title = religion
    ? `${religionLabel} sacred sites in ${cityName}`
    : `Sacred sites and places of worship in ${cityName}`;
  const count = religion
    ? (city.religion_counts?.[religion] ?? city.total_count)
    : city.total_count;

  return (
    <EditorialShell
      eyebrow="City guide"
      title={title}
      intro={`SoulStep tracks ${count}+ ${
        religion ? `${religionLabel.toLowerCase()} places` : 'sacred sites'
      } in ${cityName}. Use this guide as a starting point for comparing neighborhoods, choosing places to save, and building a realistic visit plan. Each city page is meant to give travelers enough context to move beyond a generic map search and understand which listings have the strongest visitor signals.`}
    >
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">What this city page covers</h3>
        <p className="mt-2">
          City pages gather listings that share local context, making it easier to compare
          addresses, ratings, photos, and visitor notes without jumping between unrelated searches.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">How to decide where to go</h3>
        <p className="mt-2">
          Look for complete pages with a clear name, usable address, strong photos, and descriptive
          details. These signals usually point to listings that are easier to verify and more useful
          for real-world planning.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Build a respectful route</h3>
        <p className="mt-2">
          Save candidate places, check opening information, and leave enough time between stops.
          Sacred-site travel works best when the route leaves space for quiet, observation, and
          local norms.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Compare local signals</h3>
        <p className="mt-2">
          Ratings, review volume, photos, and address quality help identify listings that are easier
          to verify. These signals are especially useful in large cities where many places can share
          similar names.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Use religion filters</h3>
        <p className="mt-2">
          Religion filters help narrow the city view when you are planning a tradition-specific
          visit, but they also make interfaith discovery easier by showing how different communities
          are distributed across the same destination.
        </p>
      </div>
      <div>
        <h3 className="font-semibold text-text-main dark:text-white">Check before arrival</h3>
        <p className="mt-2">
          Always confirm current access rules and timings before visiting. SoulStep gives a planning
          layer, while local signs, official pages, and community guidance should shape the final
          visit.
        </p>
      </div>
    </EditorialShell>
  );
}

export function PlaceEditorialContent({ place }: { place: PlaceForMeta }) {
  const location = [place.city, place.country].filter(Boolean).join(', ');
  const typeLabel = [place.religion, place.place_type].filter(Boolean).join(' ');
  const description =
    place.description ||
    place.seo_meta_description ||
    `${place.name} is listed on SoulStep as a ${typeLabel || 'sacred site'}${
      location ? ` in ${location}` : ''
    }.`;

  return (
    <section className="mx-auto my-8 w-full max-w-4xl px-4 lg:px-6" aria-labelledby="place-guide">
      <article className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-soft dark:border-dark-border dark:bg-dark-surface lg:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          SoulStep place guide
        </p>
        <h1 id="place-guide" className="mt-3 text-2xl font-bold text-text-main dark:text-white">
          About {place.name}
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-dark-text-secondary lg:text-base">
          {description}
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-dark-text-secondary lg:text-base">
          Use this SoulStep place page to review the practical details before planning a visit. The
          most useful signals are the address, map position, photos, visitor reviews, rating count,
          and any available description or frequently asked questions. Together, they help separate
          a usable listing from a thin map result.
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-dark-text-secondary lg:text-base">
          If you intend to visit {place.name}, confirm local access rules, opening or service times,
          dress expectations, and photography guidance before arrival. Sacred sites are often active
          community spaces, so respectful planning is just as important as navigation.
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-700 dark:text-dark-text-secondary lg:text-base">
          You can save this place, compare it with nearby sacred sites, and add it to a journey when
          building a route. SoulStep is designed to connect discovery with real-world planning, so
          each complete place page can become part of a thoughtful visit instead of a one-off
          search.
        </p>
        <dl className="mt-6 grid gap-4 text-sm text-slate-700 dark:text-dark-text-secondary sm:grid-cols-2">
          {location && (
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-dark-bg">
              <dt className="font-semibold text-text-main dark:text-white">Location</dt>
              <dd className="mt-1">{location}</dd>
            </div>
          )}
          {place.address && (
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-dark-bg">
              <dt className="font-semibold text-text-main dark:text-white">Address</dt>
              <dd className="mt-1">{place.address}</dd>
            </div>
          )}
          {typeLabel && (
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-dark-bg">
              <dt className="font-semibold text-text-main dark:text-white">Tradition and type</dt>
              <dd className="mt-1">{typeLabel}</dd>
            </div>
          )}
          {(place.average_rating || place.review_count) && (
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-dark-bg">
              <dt className="font-semibold text-text-main dark:text-white">Visitor signal</dt>
              <dd className="mt-1">
                {place.average_rating
                  ? `${place.average_rating.toFixed(1)} average rating`
                  : 'Rated'}{' '}
                {place.review_count ? `from ${place.review_count} reviews` : ''}
              </dd>
            </div>
          )}
        </dl>
        {place.seo_faq_json && place.seo_faq_json.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-bold text-text-main dark:text-white">
              Frequently asked questions
            </h3>
            {place.seo_faq_json.slice(0, 4).map((item) => (
              <div key={item.question} className="rounded-2xl bg-slate-50 p-4 dark:bg-dark-bg">
                <h4 className="font-semibold text-text-main dark:text-white">{item.question}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-dark-text-secondary">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
