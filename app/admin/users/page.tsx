export default function AdminUsersPage() {
  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Joueurs</h2>
          <p>Cette page sera alimentee avec les donnees Firestore reelles des utilisateurs.</p>
        </div>
        <div className="empty-state">
          <strong>Aucune vue exploitable disponible pour le moment</strong>
          <p>
            Les faux indicateurs ont ete retires. La prochaine etape est de brancher
            la liste reelle des joueurs.
          </p>
        </div>
      </div>
    </section>
  );
}
