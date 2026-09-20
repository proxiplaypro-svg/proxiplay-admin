# Prospection — V1

Branche : `feat/prospection-admin`. Aucun déploiement Firebase ou Vercel.

## Audit et choix d’intégration

- Next.js 16.2.2, App Router, React 19, TypeScript, Tailwind et composants admin existants.
- Navigation et protection visuelle réutilisées via `app/admin/layout.tsx` et `Sidebar`.
- Toutes les opérations passent par `assertIsAdminRequest` : jeton Firebase Auth vérifié côté serveur, puis liste des emails administrateurs existante (`ADMIN_EMAILS` ou valeur par défaut du dépôt).
- Firestore Admin SDK existant, sans modification des comptes, jeux ou commerçants.
- Commerces : `enseignes`, plus collection historique `merchants`. Le dédoublonnage connaît `phone_number`, `site_web_url`, `title`, `merchantName`, ainsi que les champs canoniques.
- L’éditeur Google Place ID existant appelle une fonction `searchGooglePlaces` en `us-central1`, dont le backend n’est pas dans ce dépôt. Son contrat visible ne garantit ni rayon, ni détails. La prospection utilise donc un adaptateur serveur distinct Google Places (New), sans modifier cet éditeur ni exposer de clé au navigateur.

## Fonctionnalités

- `/admin/prospection` : huit compteurs, tableau, filtres statut/secteur/ville/source/date d’ajout/texte, ajout manuel.
- Recherche : Dunkerque, 15 km, secteurs sélectionnables, maximum 1–60 résultats. Résultats temporaires avec détection client/doublon, sélection puis import explicite.
- `/admin/prospection/[id]` : entreprise, contact, qualification, angle et message éditables, notes, statut, dates de contact/relance, attribution, historique.
- Actions : appeler, copier email/message, ouvrir site/Maps, journaliser un appel effectué, ajouter une note, supprimer avec confirmation.
- Enrichissement depuis un Place ID : complète uniquement les coordonnées manquantes ; aperçu dans le formulaire, puis sauvegarde explicite.
- Conversion : association explicite à une enseigne existante, obligatoire pour le statut `client`. Aucune création automatique d’enseigne ni de compte.
- Aucun email envoyé, aucune relance ni tâche automatique.

## Modèle Firestore

`prospects/{id}` :

```ts
{
  name, normalized_name, address, postal_code, city,
  latitude: number | null, longitude: number | null,
  category, subcategory, phone, email, website,
  google_place_id, google_maps_url,
  contact_name, contact_role, contact_email, contact_phone,
  source, source_url, fetched_at: string | null,
  status: 'new' | 'to_contact' | 'contacted' | 'follow_up'
    | 'replied' | 'meeting' | 'client' | 'rejected',
  qualification: null | {
    summary: string | null,
    relevance: number | null, // pertinence commerciale 0–100, jamais solvabilité
    reasons: string[],
    suggested_angle: string | null,
    suggested_message: string | null
  },
  qualification_provider: string | null,
  suggested_angle, suggested_message, notes, assigned_to,
  created_at: string, updated_at: string,
  last_contact_at: string | null, next_follow_up_at: string | null,
  converted_enseigne_id: string | null,
  revision: number,
  deleting?: boolean
}
```

Les champs sans annotation sont des chaînes ; une chaîne vide représente une donnée textuelle inconnue. Dates ISO UTC produites/validées côté serveur. `created_at`, `updated_at`, `revision`, qualification et journal sont gérés par le service. `source` vaut initialement `manual` ou `google_places`. Un enrichissement conserve la source initiale et actualise `source_url`/`fetched_at`.

`prospects/{id}/history/{eventId}` : `{ action, actor, at, detail }`.
`actor` est l’UID admin, `at` une date ISO UTC. Création, modifications (liste des champs et transitions de statut), notes, appel déclaré et génération du brouillon sont journalisés atomiquement avec la fiche.

`prospection_internal/write_lock` : `{ updated_at }`, verrou transactionnel commun aux écritures du module pour empêcher les doubles créations concurrentes. Les modifications vérifient également `revision` pour éviter d’écraser une fiche modifiée par un autre administrateur.

La suppression marque d’abord la fiche comme en cours de suppression puis supprime récursivement fiche et historique. En cas d’échec réseau exceptionnel pendant cette seconde étape, la suppression peut être rejouée avec le même identifiant et la même révision via l’API ; le marqueur empêche les modifications concurrentes.

## Dédoublonnage

Comparaison par Place ID, nom normalisé + adresse, téléphone normalisé (dont formats français 0/+33/0033), domaine web sans `www`, email/contact email. Vérification dans les prospects et les deux collections de commerces, à la recherche puis de nouveau dans la transaction d’import/création/modification. Les doublons internes à une sélection sont également bloqués. Un nom seul ne suffit pas. Aucun rapprochement ne fusionne des données.

Les domaines, téléphones ou adresses partagés peuvent correspondre à plusieurs établissements : la V1 les bloque par prudence et demande une vérification humaine. Elle n’offre pas de bouton de contournement. Une adresse rédigée très différemment peut nécessiter un autre identifiant commun pour être détectée. La création d’une enseigne par un système externe ne partage pas le verrou du module ; le contrôle reflète les données visibles lors de la transaction.

## Sécurité et index

`firestore.rules` ajoute un refus de toute lecture/écriture directe sur `prospects/**` et `prospection_internal/**`, y compris pour les clients SDK admin. Seules les routes serveur authentifiées utilisent l’Admin SDK. Les règles existantes des autres collections ne changent pas.

Aucun nouvel index composite : tri simple sur `created_at` et `history.at`, filtres appliqués en mémoire pour cette V1. Les index simples automatiques de Firestore suffisent. Aucune règle ni aucun index n’a été déployé.

## Providers et configuration

`ProspectProvider` expose `search` et `getDetails`. L’adaptateur Google utilise Text Search pour résoudre la localisation puis rechercher les secteurs ; la distance géographique est vérifiée côté serveur car `locationBias` seul ne limite pas strictement le rayon. Détails via Place Details. Référence : [Google Places Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search).

Nouvelle variable **serveur uniquement** : `GOOGLE_PLACES_API_KEY`, clé autorisée pour Places API (New). Sans cette variable, l’interface indique que la recherche est indisponible, l’ajout manuel et le suivi restent utilisables. Aucun appel réel facturable n’a été effectué pendant les tests ; les réponses Google ont été simulées.

Configuration réutilisée : variables Firebase client existantes, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` en production ; `GOOGLE_APPLICATION_CREDENTIALS` possible en développement selon le code existant ; `ADMIN_EMAILS` selon la configuration admin du dépôt. Ne pas préfixer la clé Places par `NEXT_PUBLIC_`.

`QualificationProvider` est une interface séparée. `parseQualification` exige exactement cinq champs JSON, valide types, bornes, longueurs et justifications ; toute réponse invalide est rejetée avant sauvegarde. Seuls nom, activité, ville et site sont transmis au provider, jamais les contacts personnels ou notes.

La V1 active `factual-draft-v1`, **sans IA externe**, sans score inventé. Elle produit un brouillon contextualisé et des points à vérifier à partir des informations disponibles. Aucune variable IA requise. Le champ `relevance` reste `null`. Un futur adaptateur IA devra conserver le parseur et distinguer explicitement faits disponibles et hypothèses ; la validation structurelle seule ne prouve pas l’exactitude des faits.

## Tests et vérification

Commandes ajoutées :

```sh
npm run test:prospection
npm run test:prospection-api
```

- 6 tests unitaires : validation, identités/doublons, JSON strict, enrichissement, minimisation des données de qualification, provider et rayon.
- 9 tests d’intégration Auth/Firestore : accès admin/non-admin/anonyme/invalide, CRUD et révisions, statuts, clients existants, doublons, imports concurrents, recherche sans écriture, import de la sélection, conversion, journal, suppression, règles directes.
- `tsc --noEmit` et build Next.js.
- ESLint ciblé sur tous les fichiers TypeScript/TSX Prospection et la navigation.
- Lint global exécuté : 14 erreurs et 24 avertissements préexistants, hors Prospection (`app/admin/dashboard/page.tsx`, `app/admin/games/[gameId]/PrizeUsageDeadlineEditor.tsx`, `scripts/prepare-prize-merchant-patch.cjs` pour les erreurs). Aucun correctif hors périmètre ajouté.

Les tests n’accèdent qu’au projet fictif `demo-prospection`, avec garde obligatoire sur les deux adresses d’émulateur locales. Sur cette machine, la CLI voulait télécharger Firestore 1.22.0 mais échouait sur le certificat TLS ; les tests ont utilisé le JAR 1.21.0 déjà installé, avec les règles locales, et l’émulateur Auth fourni par la CLI :

```powershell
java -jar C:/Users/pasca/.cache/firebase/emulators/cloud-firestore-emulator-v1.21.0.jar --host 127.0.0.1 --port 8080 --project_id demo-prospection --rules firestore.rules
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
firebase emulators:exec --project demo-prospection --only auth "node node_modules/tsx/dist/cli.mjs --test prospection-api.test.ts"
```

## Limites et suite

- V1 destinée à un volume modéré : liste, compteurs, filtres et contrôle des clients lisent les collections ; prévoir pagination, index d’identité et agrégats à plus grande échelle.
- Une page Google par secteur, jusqu’à 20 résultats par secteur, 60 au total ; liste non exhaustive. Les résultats hors rayon sont retirés, le total peut donc être inférieur à la limite demandée.
- Recherche Google et enrichissement nécessitent configuration, quotas et validation avec une clé réelle ; pas de test réel du fournisseur pendant cette livraison.
- Pas de qualification IA distante, pas de scraping de sites, pas d’invention de décideur/email.
- Conversion limitée à l’association d’une enseigne déjà créée dans l’admin existant.
- Contrôles API/règles/build réalisés ; parcours visuel avec session admin réelle non automatisé.
- Suppression à la demande disponible ; pas de politique de purge automatique.
- V2 : envoi manuel d’emails, modèles, séquences, relances avec arrêt à réception d’une réponse et historique email. V3 : recherche planifiée, campagnes, enrichissement avancé, statistiques et rendez-vous. Ces fonctionnalités ne sont pas implémentées ici.

## Fichiers

Créés :

- `app/admin/prospection/page.tsx`
- `app/admin/prospection/[id]/page.tsx`
- `app/admin/prospection/prospection.module.css`
- `app/api/admin/prospection/route.ts`
- `components/admin/prospection/ProspectFields.tsx`
- `lib/prospection/model.ts`
- `lib/prospection/server.ts`
- `lib/prospection/provider.ts`
- `lib/prospection/qualification.ts`
- `lib/prospection/client.ts`
- `prospection.test.ts`
- `prospection-api.test.ts`
- `docs/PROSPECTION.md`

Modifiés : `components/admin/Sidebar.tsx`, `firestore.rules`, `package.json`.

Modifications préexistantes exclues du commit : `app/admin/games/page.tsx`, `lib/firebase/gamesQueries.ts`, `game-relaunch.test.ts`, `lib/firebase/gameRelaunchWorkflow.ts`.
