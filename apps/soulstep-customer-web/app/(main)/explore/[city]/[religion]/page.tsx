import type { Metadata } from 'next';
import ExploreCity from '@/app/pages/ExploreCity';
import { fetchCityMeta } from '@/lib/server/api';
import { buildCityReligionMetadata } from '@/lib/server/metadata';

type Props = { params: Promise<{ city: string; religion: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, religion } = await params;
  try {
    const data = await fetchCityMeta(city);
    const count = data.religion_counts?.[religion] ?? data.total_count;
    return buildCityReligionMetadata(city, data.city, religion, count);
  } catch {
    const label = city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const relLabel = religion.charAt(0).toUpperCase() + religion.slice(1);
    return { title: `${relLabel} Sacred Sites in ${label}` };
  }
}

export default function Page() {
  return <ExploreCity />;
}
