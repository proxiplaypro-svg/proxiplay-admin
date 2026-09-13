import type { ReactNode } from "react";
import PrizeUsageDeadlineEditor from "./PrizeUsageDeadlineEditor";

type GameLayoutProps = {
  children: ReactNode;
  params: Promise<{
    gameId: string;
  }>;
};

export default async function GameLayout({ children, params }: GameLayoutProps) {
  const { gameId } = await params;

  return (
    <>
      {children}
      <PrizeUsageDeadlineEditor gameId={gameId} />
    </>
  );
}
