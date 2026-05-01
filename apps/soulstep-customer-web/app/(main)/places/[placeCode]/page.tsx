import type { Metadata } from 'next';
import PlaceDetail from '@/app/pages/PlaceDetail';
import { JsonLd } from '@/components/server/JsonLd';
import { fetchPlace, type PlaceForMeta } from '@/lib/server/api';
import { buildPlaceMetadata, buildPlaceJsonLd } from '@/lib/server/metadata';
import { PlaceEditorialContent } from '../../_components/PublicEditorialContent';

type Props = { params: Promise<{ placeCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { placeCode } = await params;
  try {
    const place = await fetchPlace(placeCode);
    return buildPlaceMetadata(place);
  } catch {
    return { title: 'Sacred Site' };
  }
}

export default async function Page({ params }: Props) {
  const { placeCode } = await params;
  let schemas: Record<string, unknown>[] = [];
  let place: PlaceForMeta | null = null;
  try {
    place = await fetchPlace(placeCode);
    schemas = buildPlaceJsonLd(place);
  } catch {
    // Client component handles error state
  }
  return (
    <>
      <JsonLd schemas={schemas} />
      <PlaceDetail />
      {place && <PlaceEditorialContent place={place} />}
    </>
  );
}
