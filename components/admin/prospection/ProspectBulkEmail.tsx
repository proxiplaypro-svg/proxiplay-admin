"use client";
import { useEffect, useRef, useState } from "react";
import { emailRequest } from "@/lib/prospection/emailClient";
import { notifyProspectsChanged } from "@/lib/prospection/list";
import s from "@/app/admin/prospection/prospection.module.css";

type Item = {
  id: string;
  name: string;
  to: string;
  subject?: string;
  body?: string;
  state: string;
  reason?: string;
  retryable?: boolean;
};
type Batch = {
  id: string;
  confirmed: boolean;
  identity: { from: string; replyTo: string };
  items: Item[];
};
const label: Record<string, string> = {
  ready: "Prêt",
  processing: "En cours",
  sent: "Envoyé",
  failed: "Échec",
  unknown: "À vérifier",
  excluded: "Exclu",
};

export function ProspectBulkEmail({
  ids,
  emailCount,
  disabled,
}: {
  ids: string[];
  emailCount: number;
  disabled: boolean;
  campaign?: { kind: "initial" | "follow_up" };
}) {
  const [mode, setMode] = useState<"group" | "personal">("group"),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [batch, setBatch] = useState<Batch | null>(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  useEffect(() => {
    void emailRequest<{ subject: string; body: string }>({
      action: "batch_template",
      kind: "initial",
    })
      .then((t) => {
        setSubject((current) => current || t.subject);
        setBody((current) => current || t.body);
      })
      .catch(() => {});
  }, []);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const r = await emailRequest<{ batch: Batch }>({
        action: "batch_prepare",
        batchId: crypto.randomUUID(),
        ids,
        subject,
        body,
        personalized: mode === "personal",
      });
      setBatch(r.batch);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Préparation impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function process(id: string) {
    running.current = true;
    setSending(true);
    try {
      while (running.current) {
        const r = await emailRequest<{ batch: Batch; waitMs?: number }>({
          action: "batch_step",
          batchId: id,
        });
        setBatch(r.batch);
        notifyProspectsChanged();
        if (
          !r.batch.items.some(
            (i) => i.state === "ready" || i.state === "processing",
          )
        )
          break;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(1000, Math.min(r.waitMs || 30000, 30000)),
          ),
        );
      }
    } finally {
      running.current = false;
      setSending(false);
    }
  }
  const ready = batch?.items.filter((i) => i.state === "ready").length || 0,
    excluded = batch?.items.filter((i) => i.state === "excluded") || [];
  return (
    <div className={s.composer}>
      <fieldset disabled={busy || sending}>
        <legend>Type de message</legend>
        <label className={s.check}>
          <input
            type="radio"
            checked={mode === "group"}
            onChange={() => setMode("group")}
          />
          Mail groupé
        </label>
        <span className={s.muted}>
          Même contenu, envoyé séparément à chaque commerce.
        </span>
        <label className={s.check}>
          <input
            type="radio"
            checked={mode === "personal"}
            onChange={() => setMode("personal")}
          />
          Mail personnalisé
        </label>
        <span className={s.muted}>
          Utilisez [commerce], [ville] ou [categorie] : seuls les champs
          réellement renseignés sont insérés.
        </span>
      </fieldset>
      <label>
        Objet
        <input
          value={subject}
          maxLength={200}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label>
        Message
        <textarea
          value={body}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <button
        className={s.primary}
        disabled={
          disabled || busy || !emailCount || !subject.trim() || !body.trim()
        }
        onClick={() => void prepare()}
      >
        Prévisualiser les messages ({emailCount})
      </button>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {batch && (
        <section className={s.preview}>
          <h3>Prévisualisation avant envoi</h3>
          <p>
            {ready} prêt(s) à envoyer · {excluded.length} exclu(s). L’envoi n’a
            pas commencé.
          </p>
          {excluded.length > 0 && (
            <details>
              <summary>Voir les exclusions</summary>
              <ul>
                {excluded.map((i) => (
                  <li key={i.id}>
                    {i.name} — {i.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <ul className={s.prospectList}>
            {batch.items
              .filter((i) => i.state !== "excluded")
              .map((i) => (
                <li className={s.bulkItem} key={i.id}>
                  <strong>{i.name}</strong> · {i.to}
                  <details>
                    <summary>Voir le message</summary>
                    <p>Objet : {i.subject}</p>
                    <pre className={s.bulkBody}>{i.body}</pre>
                  </details>
                  <p>
                    {label[i.state] || i.state}
                    {i.reason && ` — ${i.reason}`}
                  </p>
                </li>
              ))}
          </ul>
          {ready > 0 && !sending && (
            <button onClick={() => setConfirm(true)}>
              {batch.confirmed ? "Reprendre l’envoi" : "Confirmer l’envoi"}
            </button>
          )}
          {sending && (
            <button
              onClick={() => {
                running.current = false;
              }}
            >
              Suspendre après l’email en cours
            </button>
          )}
          {confirm && (
            <div role="alertdialog" aria-label="Confirmation de l’envoi">
              <p>Confirmer l’envoi individuel de {ready} email(s) ?</p>
              <button onClick={() => setConfirm(false)}>Annuler</button>
              <button
                className={s.primary}
                onClick={() => {
                  setConfirm(false);
                  void emailRequest({
                    action: "batch_confirm",
                    batchId: batch.id,
                    confirmed: true,
                  })
                    .then(() => process(batch.id))
                    .catch((e) =>
                      setError(
                        e instanceof Error ? e.message : "Envoi impossible.",
                      ),
                    );
                }}
              >
                Envoyer maintenant
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
