# Prospection — lots successifs de 20 ou 50

Cette version remplace le mode Discovery V1.1 jusqu’à 100. Branche : feat/prospection-batches, base main e94e7af60631d34227f5e82f5cb404a8738246d6. Aucun changement hors Prospection, aucune IA ajoutée, aucun email.

## Fonctionnement

- Recherche initiale : choix 20 ou 50, 50 par défaut ; jusqu’au nombre demandé, avec les états Nouveau / Déjà prospect / Déjà client / Ignoré et les filtres existants.
- Après import, le tableau reste visible et ses états sont recalculés. Ignorer et Réactiver restent disponibles.
- Le bouton « Trouver 50 nouvelles entreprises » reprend les critères du dernier lot réussi (rappelés à côté du bouton), pas des champs modifiés sans lancer une nouvelle recherche. Il est disponible même si le lot précédent n’est pas entièrement traité.
- Le nouveau lot contient seulement des établissements absents des clients, prospects et exclusions persistantes au moment du contrôle. Le nombre affiché est réel, par exemple « 23 nouvelles entreprises trouvées », accompagné du nombre de Place IDs connus écartés.
- Une entreprise seulement affichée, mais ni importée, ni cliente, ni ignorée, reste nouvelle et peut réapparaître. Afficher un résultat ne crée aucune donnée.
- Si aucun nouveau résultat n’est accessible, le tableau reste vide et suggère d’adapter le secteur ou la zone. Aucune relance automatique.

## Stratégie serveur et persistance

À chaque action, le service relit les collections existantes : enseignes, merchants historique, prospects, prospection_internal/discovery/ignored. Les correspondances Place ID sont reconnues même si le nom Google a changé ; les heuristiques de doublons V1 (téléphone, domaine, adresse, etc.) restent conservées. Les exclusions utilisent le Place ID.

Le provider parcourt la pagination native Text Search (New). Les candidats connus sont filtrés AVANT de compter les résultats du lot ; une page remplie de clients/prospects/ignorés ne provoque donc pas un arrêt prématuré. Un Set de Place IDs vus déduplique également les candidats rejetés entre pages/secteurs et évite de gonfler le compteur d’exclusions.

Pour chaque secteur sélectionné, jusqu’à trois pages ; puis, s’il reste du budget, le secteur suivant. Paramètres de recherche identiques entre pages, sauf pageToken. Arrêt au nombre demandé, au budget global, à l’épuisement des secteurs ou des tokens ; un token répété interrompt cette pagination. Le rayon initial est vérifié sur chaque résultat.

Le serveur relit les états après les appels Google pour retirer les établissements traités pendant la recherche. L’import conserve son recontrôle transactionnel. Aucun état de traitement stocké uniquement dans React, aucun nouveau marqueur « vu », aucun curseur persistant ni nouvelle collection ou index Firestore.

## Appels et limites

| Action | Résultats maximum | Appels Google maximum, localisation comprise |
| --- | --- | --- |
| Recherche initiale 20 | 20 | 2 (1 localisation + 1 page) |
| Recherche initiale 50 | 50 | 5 (1 localisation + 4 pages, tous secteurs confondus) |
| Trouver 50 nouvelles entreprises | 50 nouvelles | 5 (même plafond) |

Avec un seul secteur, trois pages au plus : 4 appels total. Avec plusieurs secteurs, la quatrième page peut servir au secteur suivant. Le budget est partagé, les premiers secteurs peuvent le consommer avant les suivants. Timeout par appel : 15 secondes, aucun retry automatique ni appel de détails par résultat.

L’option 100 est refusée par l’API et supprimée de l’interface. Les biais géographiques décalés et leur code ont été retirés. Import et réannotation sont également limités à 50 établissements.

Important : les lots ne garantissent pas un parcours exhaustif de toute la zone. Google limite actuellement une requête Text Search à 60 résultats sur toutes ses pages. Sans recherche géographique complémentaire, un premier lot de 50 nouveaux peut n’être suivi que de 10 nouveaux, puis de zéro sur les mêmes critères. Les appels suivants peuvent relire des pages déjà consultées : seuls les résultats persistants traités sont exclus, Google ne propose pas ici de filtre négatif par Place ID. Le système ne simule aucune page supplémentaire et ne promet jamais 50 nouvelles entreprises.

Référence vérifiée le 20 septembre 2026 : https://developers.google.com/maps/documentation/places/web-service/text-search

Le nombre maximum d’appels et le FieldMask sont identiques à l’ancien mode 50. Le coût maximal par action n’augmente donc pas à tarif Google constant. Une série de plusieurs actions reste facturée séparément ; les appels relisant des résultats connus sont également facturables.

## Sécurité et données

Les masques Google, notes/nombres d’avis et règles d’enrichissement manuel restent ceux de V1.1. Aucun avis textuel demandé. GOOGLE_PLACES_API_KEY n’est lue que côté serveur ; seul un booléen de disponibilité est renvoyé au navigateur. Recherche, exclusion, réactivation et import restent réservés aux administrateurs.

## Validation

Tests unitaires : 20/50, rejet 100 avant tout appel, pagination, doublons Place ID, rayon, tokens absents/répétés, budgets, arrêt au nombre de nouveaux demandé, 23 résultats restants puis épuisement, graphe des imports client.

Tests API avec Google simulé et projet demo-prospection : clients/prospects/ignorés persistants, premier lot avec états, lot suivant uniquement nouveau, import puis requête suivante sans réapparition, compteur d’exclusions, rejet du mode 100, import plafonné à 50, autorisations et règles existantes.

Commandes : npm run test:prospection ; tests API via émulateurs Firestore 1.21.0 + Auth locaux ; npx tsc --noEmit ; npm run build ; ESLint ciblé. Build avec clé sentinelle factice et inspection des bundles navigateur. Aucun appel Google réel facturable pendant la validation.

Fichiers : app/admin/prospection/page.tsx, app/api/admin/prospection/route.ts, lib/prospection/model.ts, lib/prospection/provider.ts, lib/prospection/server.ts, prospection.test.ts, prospection-api.test.ts, docs/PROSPECTION_DISCOVERY_V11.md et ce rapport.

Résultats : 19/19 tests unitaires et 14/14 tests API réussis. TypeScript, build et lint ciblé validés. 58 bundles navigateur inspectés : aucune référence à la clé sentinelle, à GOOGLE_PLACES_API_KEY ou au provider Google.
