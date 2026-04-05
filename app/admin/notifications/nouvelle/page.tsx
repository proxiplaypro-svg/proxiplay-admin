export default function NewNotificationPage() {
  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Nouvelle notification</h2>
          <p>Zone reservee au composeur push admin.</p>
        </div>
        <div className="empty-state">
          <strong>Composeur push a connecter</strong>
          <p>
            La route existe pour que les actions du dashboard pointent deja vers un ecran dedie.
          </p>
        </div>
      </div>
    </section>
  );
}
