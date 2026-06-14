import { PosterVisualGeneratorPage } from "@/components/admin/jeux/PosterVisualGeneratorPage";

export default async function AdminGameVisualGeneratorPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  return <PosterVisualGeneratorPage gameId={gameId} />;
}
