import NewGameForm from "../NewGameForm";

export default function NewScratchGamePage() {
  return (
    <NewGameForm
      accessMode="public"
      heading="Nouveau jeu à gratter"
      intro="Le joueur joue librement depuis l'app, sans scanner de QR code. Réservé à un seul commerçant. Le jeu est créé en brouillon : active-le ensuite depuis la liste des jeux."
      titlePlaceholder="Grattage en boutique"
    />
  );
}
