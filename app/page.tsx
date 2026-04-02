export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#0b1020",
        color: "#ffffff",
        padding: "48px 32px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 12px",
            border: "1px solid #2a3558",
            borderRadius: 999,
            fontSize: 12,
            color: "#9fb0e0",
            marginBottom: 24,
          }}
        >
          Proxiplay · Admin
        </div>

        <h1
          style={{
            fontSize: 42,
            lineHeight: 1.1,
            margin: "0 0 12px",
          }}
        >
          Proxiplay Admin
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "#b7c3e0",
            maxWidth: 720,
            margin: "0 0 32px",
          }}
        >
          Back-office sécurisé en cours de construction pour piloter les utilisateurs,
          les jeux, les notifications et les actions admin de Proxiplay.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          {[
            "Gestion utilisateurs",
            "Gestion jeux",
            "Notifications",
            "Logs d’administration",
          ].map((item) => (
            <div
              key={item}
              style={{
                background: "#121933",
                border: "1px solid #263154",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{item}</h2>
              <p style={{ margin: 0, color: "#9fb0e0", fontSize: 14 }}>
                Module prévu dans le socle admin.
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}