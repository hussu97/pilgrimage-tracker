import type { Metadata } from 'next';
import ExploreCity from '@/app/pages/ExploreCity';
import { fetchCityMeta, type CityMeta } from '@/lib/server/api';
import { buildCityMetadata } from '@/lib/server/metadata';
import { CityEditorialContent } from '../../_components/PublicEditorialContent';

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  try {
    const data = await fetchCityMeta(city);
    return buildCityMetadata(city, data.city, data.total_count);
  } catch {
    const label = city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: `Sacred Sites in ${label}` };
  }
}

export default async function Page({ params }: Props) {
  const { city } = await params;
  let cityMeta: CityMeta | null = null;
  try {
    cityMeta = await fetchCityMeta(city);
  } catch {
    // The client page still handles loading and errors.
  }

  return (
    <>
      <ExploreCity />
      {cityMeta && <CityEditorialContent city={cityMeta} />}
    </>
  );
}
