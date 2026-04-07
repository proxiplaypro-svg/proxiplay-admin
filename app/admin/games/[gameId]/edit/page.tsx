"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  getDoc,
  Timestamp,
  updateDoc,
  type DocumentReference,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client-app";

type GameEditPageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

type FirestoreGameEditDocument = {
  name?: string;
  description?: string;
  prize_value?: number;
  photo?: string;
  start_date?: Timestamp;
  end_date?: Timestamp;
  enseigne_id?: DocumentReference;
  enseigne_name?: string;
  visible_public?: boolean;
  hasMainPrize?: boolean;
};

type GameFormState = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "actif" | "termine" | "brouillon";
  mainPrizeValue: string;
  scratchImage: string;
};

type EditGameSnapshot = {
  id: string;
  merchantId: string | null;
  merchantName: string;
  winnersCount: number;
  form: GameFormState;
};

function formatDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function deriveStatus(game: FirestoreGameEditDocument, now = new Date()) {
  const startDate = game.start_date?.toDate();
  const endDate = game.end_date?.toDate();

  if (!game.visible_public) {
    return "brouillon" as const;
  }

  if (endDate && endDate.getTime() < now.getTime()) {
    return "termine" as const;
  }

  if (
    startDate &&
    endDate &&
    startDate.getTime() <= now.getTime() &&
    endDate.getTime() >= now.getTime()
  ) {
    return "actif" as const;
  }

  return "brouillon" as const;
}

function buildInitialForm(game: FirestoreGameEditDocument): GameFormState {
  return {
    name: game.name?.trim() ?? "",
    description: game.description?.trim() ?? "",
    startDate: game.start_date ? formatDateTimeInput(game.start_date.toDate()) : "",
    endDate: game.end_date ? formatDateTimeInput(game.end_date.toDate()) : "",
    status: deriveStatus(game),
    mainPrizeValue:
      typeof game.prize_value === "number" && Number.isFinite(game.prize_value)
        ? String(game.prize_value)
        : "",
    scratchImage: game.photo?.trim() ?? "",
  };
}

function getReadErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Connexion requise pour charger ce jeu.";
      case "unavailable":
        return "Firestore est temporairement indisponible. Reessaie dans un instant.";
      default:
        return "Impossible de charger le formulaire d edition.";
    }
  }

  return "Impossible de charger le formulaire d edition.";
}

function getSaveErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Tu n as pas les droits necessaires pour enregistrer ce jeu.";
      case "unavailable":
        return "Firestore est temporairement indisponible. La sauvegarde n a pas abouti.";
      default:
        return "La sauvegarde a echoue. Verifie les champs puis reessaie.";
    }
  }

  return "La sauvegarde a echoue. Verifie les champs puis reessaie.";
}

function getUploadErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "storage/unauthorized":
        return "Tu n as pas les droits necessaires pour envoyer cette image.";
      case "storage/canceled":
        return "L upload a ete annule.";
      case "storage/unknown":
        return "Une erreur Storage est survenue pendant l upload.";
      default:
        return "Impossible d envoyer l image pour le moment.";
    }
  }

  return "Impossible d envoyer l image pour le moment.";
}

function validateForm(form: GameFormState) {
  const errors: string[] = [];
  const startDate = form.startDate ? new Date(form.startDate) : null;
  const endDate = form.endDate ? new Date(form.endDate) : null;

  if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
    errors.push("La date de fin doit etre strictement superieure a la date de debut.");
  }

  return errors;
}

export default function EditGamePage({ params }: GameEditPageProps) {
  const router = useRouter();
  const [game, setGame] = useState<EditGameSnapshot | null>(null);
  const [form, setForm] = useState<GameFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    let isCancelled = false;

    const loadGame = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        const gameRef = doc(db, "games", resolvedParams.gameId);
        const gameSnapshot = await getDoc(gameRef);

        if (isCancelled) {
          return;
        }

        if (!gameSnapshot.exists()) {
          setGame(null);
          setForm(null);
          setError("Jeu introuvable.");
          return;
        }

        const prizesSnapshot = await getDocs(collection(db, "prizes"));

        if (isCancelled) {
          return;
        }

        const winnersCount = prizesSnapshot.docs.reduce((total, prizeDoc) => {
          const prizeGameRef = prizeDoc.get("game_id");
          return prizeGameRef?.id === resolvedParams.gameId ? total + 1 : total;
        }, 0);

        const data = gameSnapshot.data() as FirestoreGameEditDocument;
        const nextForm = buildInitialForm(data);
        const nextGame = {
          id: resolvedParams.gameId,
          merchantId: data.enseigne_id?.id ?? null,
          merchantName: data.enseigne_name?.trim() || "Commercant non renseigne",
          winnersCount,
          form: nextForm,
        } satisfies EditGameSnapshot;

        setGame(nextGame);
        setForm(nextForm);
      } catch (loadError) {
        console.error(loadError);
        if (!isCancelled) {
          setGame(null);
          setForm(null);
          setError(getReadErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadGame();

    return () => {
      isCancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!selectedImageFile) {
      setLocalImagePreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedImageFile);
    setLocalImagePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImageFile]);

  const modifiableFields = useMemo(
    () => [
      "Nom du jeu",
      "Description",
      "Date de debut",
      "Date de fin",
      "Statut via visible_public + dates",
      "Valeur du lot principal via prize_value",
      "Image a gratter via photo",
    ],
    [],
  );

  const previewImage = localImagePreview ?? form?.scratchImage.trim() ?? "";

  if (loading) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="game-details-skeleton">
            <span className="skeleton-line skeleton-label" />
            <strong className="skeleton-line skeleton-value" />
            <div className="dashboard-placeholder-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={index} className="dashboard-placeholder-card skeleton-card">
                  <span className="skeleton-line skeleton-label" />
                  <strong className="skeleton-line skeleton-value" />
                  <small className="skeleton-line skeleton-helper" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!game || !form) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="empty-state">
            <strong>{error ?? "Jeu introuvable"}</strong>
            <p>Retourne a la liste des jeux pour selectionner un jeu valide.</p>
          </div>
        </div>
      </section>
    );
  }

  const handleChange = (field: keyof GameFormState, value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    if (field === "scratchImage") {
      setUploadError(null);
      setUploadSuccess(null);
    }
  };

  const handleImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadError(null);
    setUploadSuccess(null);

    if (!file) {
      setSelectedImageFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSelectedImageFile(null);
      setUploadError("Le fichier selectionne doit etre une image valide.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSelectedImageFile(null);
      setUploadError("L image depasse 5 Mo. Choisis un fichier plus leger.");
      event.target.value = "";
      return;
    }

    setSelectedImageFile(file);
  };

  const handleImageUpload = async () => {
    if (isUploadingImage || !selectedImageFile || !game) {
      return;
    }

    setIsUploadingImage(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const sanitizedFileName = selectedImageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageRef = ref(
        storage,
        `games/${game.id}/${Date.now()}-${sanitizedFileName}`,
      );

      await uploadBytes(storageRef, selectedImageFile, {
        contentType: selectedImageFile.type,
      });

      const downloadUrl = await getDownloadURL(storageRef);
      setForm((current) =>
        current
          ? {
              ...current,
              scratchImage: downloadUrl,
            }
          : current,
      );
      setUploadSuccess(
        "Image envoyee avec succes. L URL Storage a ete injectee dans le champ `photo` et sera enregistree avec le formulaire.",
      );
      setSelectedImageFile(null);
    } catch (uploadErr) {
      console.error(uploadErr);
      setUploadError(getUploadErrorMessage(uploadErr));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting || isUploadingImage) {
      return;
    }

    const nextValidationErrors = validateForm(form);
    setValidationErrors(nextValidationErrors);
    setError(null);
    setSuccess(null);

    if (nextValidationErrors.length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const gameRef = doc(db, "games", game.id);
      const prizeValue = form.mainPrizeValue.trim() ? Number(form.mainPrizeValue) : null;

      await updateDoc(gameRef, {
        name: form.name.trim(),
        description: form.description.trim(),
        start_date: form.startDate ? Timestamp.fromDate(new Date(form.startDate)) : deleteField(),
        end_date: form.endDate ? Timestamp.fromDate(new Date(form.endDate)) : deleteField(),
        visible_public: form.status !== "brouillon",
        prize_value:
          prizeValue !== null && Number.isFinite(prizeValue) ? prizeValue : deleteField(),
        hasMainPrize: prizeValue !== null && Number.isFinite(prizeValue) && prizeValue > 0,
        photo: form.scratchImage.trim(),
      });

      setGame((current) =>
        current
          ? {
              ...current,
              form: { ...form },
            }
          : current,
      );
      setSuccess("Jeu enregistre avec succes. Les modifications sont maintenant stockees dans Firestore.");
    } catch (saveError) {
      console.error(saveError);
      setError(getSaveErrorMessage(saveError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading game-details-header">
          <div>
            <h2>Editer le jeu</h2>
            <p>Edition securisee du jeu `{game.form.name || game.id}` avec validations avant sauvegarde.</p>
          </div>
          <div className="game-details-header-actions">
            <Link className="row-link-button secondary" href={`/admin/games/${game.id}`}>
              Annuler
            </Link>
            {game.merchantId ? (
              <Link className="row-link-button" href={`/admin/commercants/${game.merchantId}`}>
                Voir commercant
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="panel panel-wide">
        <form className="game-edit-form" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <h2>Formulaire principal</h2>
            <p>Les champs reprennent uniquement les donnees deja presentes dans le document Firestore du jeu.</p>
          </div>

          <div className="game-edit-grid">
            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">Nom du jeu</span>
              <input
                className="search-input"
                type="text"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">Description</span>
              <textarea
                className="game-edit-textarea"
                value={form.description}
                onChange={(event) => handleChange("description", event.target.value)}
                disabled={isSubmitting}
                rows={5}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Date debut</span>
              <input
                className="search-input"
                type="datetime-local"
                value={form.startDate}
                onChange={(event) => handleChange("startDate", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Date fin</span>
              <input
                className="search-input"
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => handleChange("endDate", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Statut</span>
              <select
                className="games-filter-select"
                value={form.status}
                onChange={(event) => handleChange("status", event.target.value)}
                disabled={isSubmitting}
              >
                <option value="actif">Actif</option>
                <option value="termine">Termine</option>
                <option value="brouillon">Brouillon</option>
              </select>
            </label>

            <label className="game-edit-field">
              <span className="search-label">Commercant</span>
              <input
                className="search-input"
                type="text"
                value={game.merchantName}
                disabled
                readOnly
              />
            </label>
          </div>

          <div className="panel-heading game-edit-subheading">
            <h2>Bloc gains</h2>
            <p>Le lot principal est editable. Le nombre de gagnants reste informatif car il vient des documents `prizes`.</p>
          </div>

          <div className="game-edit-grid">
            <label className="game-edit-field">
              <span className="search-label">Lot principal</span>
              <input
                className="search-input"
                type="number"
                min="0"
                step="1"
                value={form.mainPrizeValue}
                onChange={(event) => handleChange("mainPrizeValue", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Nombre de gagnants</span>
              <input
                className="search-input"
                type="text"
                value={String(game.winnersCount)}
                disabled
                readOnly
              />
            </label>
          </div>

          <div className="panel-heading game-edit-subheading">
            <h2>Image a gratter</h2>
            <p>L image utilise le champ Firestore `photo`. Elle reste totalement optionnelle pour l admin.</p>
          </div>

          <div className="game-edit-grid">
            <div className="game-edit-field game-edit-field-wide">
              <span className="search-label">Changer l image</span>
              <div className="game-upload-panel">
                <label className="row-link-button secondary game-upload-trigger">
                  <input
                    className="game-upload-input"
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelection}
                    disabled={isSubmitting || isUploadingImage}
                  />
                  Selectionner une image
                </label>
                <button
                  className="secondary-button inline-secondary-button"
                  type="button"
                  onClick={() => void handleImageUpload()}
                  disabled={isSubmitting || isUploadingImage || !selectedImageFile}
                >
                  {isUploadingImage ? "Upload en cours..." : "Envoyer vers Storage"}
                </button>
              </div>
              <small className="helper-text">
                {selectedImageFile
                  ? `Fichier selectionne: ${selectedImageFile.name}`
                  : "Aucun fichier selectionne. Les formats image uniquement sont acceptes."}
              </small>
              {uploadError ? (
                <div className="dashboard-banner error">
                  <strong>Upload impossible</strong>
                  <p>{uploadError}</p>
                </div>
              ) : null}
              {uploadSuccess ? (
                <div className="dashboard-banner success">
                  <strong>Image prete</strong>
                  <p>{uploadSuccess}</p>
                </div>
              ) : null}
            </div>

            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">URL image a gratter</span>
              <input
                className="search-input"
                type="url"
                value={form.scratchImage}
                onChange={(event) => handleChange("scratchImage", event.target.value)}
                disabled={isSubmitting}
                placeholder="https://..."
              />
            </label>

            <div className="game-edit-field game-edit-field-wide">
              <span className="search-label">Apercu</span>
              {previewImage.trim() ? (
                <div className="game-image-preview-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="game-image-preview"
                    src={previewImage.trim()}
                    alt="Image a gratter du jeu"
                  />
                </div>
              ) : (
                <div className="empty-state compact-empty-state">
                  <strong>Aucune image renseignee</strong>
                  <p>Laisse ce champ vide si tu ne veux pas d image a gratter.</p>
                </div>
              )}
            </div>
          </div>

          <div className="panel-heading game-edit-subheading">
            <h2>Validation</h2>
            <p>Seule la coherence des dates est bloquante. Aucun champ n est obligatoire pour l admin.</p>
          </div>

          {validationErrors.length > 0 ? (
            <div className="dashboard-feedback-stack">
              {validationErrors.map((item) => (
                <div key={item} className="dashboard-banner error">
                  <strong>Validation</strong>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="dashboard-banner error">
              <strong>Sauvegarde impossible</strong>
              <p>{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="dashboard-banner success">
              <strong>Modifications enregistrees</strong>
              <p>{success}</p>
            </div>
          ) : null}

          <div className="dashboard-actions game-edit-actions">
            <button className="primary-button" type="submit" disabled={isSubmitting || isUploadingImage}>
              {isSubmitting ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              className="secondary-button inline-secondary-button"
              type="button"
              disabled={isSubmitting || isUploadingImage}
              onClick={() => router.push(`/admin/games/${game.id}`)}
            >
              Annuler
            </button>
          </div>
        </form>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Resume des champs modifiables</h2>
          <p>Le formulaire modifie seulement des champs deja existants dans `games/{game.id}`.</p>
        </div>
        <div className="action-list">
          {modifiableFields.map((item) => (
            <article key={item} className="action-item">
              <span>{item}</span>
            </article>
          ))}
          <article className="action-item">
            <span>Aucun changement backend, aucune modification de structure Firestore.</span>
          </article>
        </div>
      </div>
    </section>
  );
}
