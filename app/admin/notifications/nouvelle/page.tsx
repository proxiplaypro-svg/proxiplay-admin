import Link from "next/link";

// The previous composer is kept in legacyComposer.tsx for a later, reviewed reactivation.
// This route must not expose a second push creation path.
export default function NouvelleNotificationPage() {
  return (
    <section className="rounded-[12px] border border-[#E8E8E4] bg-white p-6 text-[#1A1A1A]">
      <h1 className="text-[22px] font-medium">Notification push</h1>
      <p className="mt-3 text-[13px] text-[#666666]">
        Les notifications push se créent depuis la page Joueurs avec le bouton « Notif push ».
        Le nombre de joueurs et de lots est confirmé avant le lancement. La programmation et les segments sont indisponibles.
      </p>
      <Link href="/admin/joueurs" className="mt-5 inline-flex rounded-[10px] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white">
        Aller à la page Joueurs
      </Link>
    </section>
  );
}
