import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ groupCode: string }>;
}

export default async function Page({ params }: PageProps) {
  const { groupCode } = await params;
  redirect(`/journeys/${groupCode}/edit-places`);
}
