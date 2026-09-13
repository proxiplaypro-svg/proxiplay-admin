import NewGameForm from "../NewGameForm";

export default function NewGamePage() {
  return (
    <NewGameForm
      accessMode="qr_only"
      heading="Nouveau jeu à scanner en boutique"
      intro="Le joueur doit scanner le QR code affiché en magasin pour participer — il ne peut pas lancer ce jeu librement depuis l'app. Réservé à un seul commerçant. Le jeu est créé en brouillon : active-le ensuite depuis la liste des jeux."
      titlePlaceholder="Cadeau à scanner en boutique"
    />
  );
}
