# Recherche Artisans B2C — audit et correction

## Diagnostic du 22 septembre 2026

Ancien code : le libellé `artisans B2C` était envoyé tel quel dans `textQuery`, sans `includedType`. La localisation était recherchée séparément ; `locationBias` utilisait un cercle de 15 km. Le serveur supprimait ensuite les lieux hors rayon. Il suivait au plus trois pages du même texte et dédoublonnait les réponses Google uniquement par Place ID. Les clients, prospects et ignorés étaient filtrés avant de compter les nouveaux résultats, puis revérifiés après Google.

Reproduction réelle avec la clé existante du projet dédiée à la prospection, sans afficher sa valeur :

| Requête | Résultats bruts | Dans le rayon | Page suivante |
| --- | ---: | ---: | --- |
| artisans B2C | 1 | 0 | non |
| plombier | 20 | 20 | oui |

Le zéro reproduit provient donc du mapping abstrait et de son unique résultat hors zone, avant toute exclusion métier. Les anciens logs ne permettent pas de reconstituer rétroactivement la réponse exacte de la session signalée. La documentation Google déconseille les requêtes ambiguës : [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search).

## Configuration et coût

La configuration centrale est `lib/prospection/searchConfig.ts`. Huit métiers complémentaires : plombier, électricien, peintre en bâtiment, menuisier, paysagiste, couvreur, chauffagiste, serrurier. Cette V1 ne lance pas les 18 métiers de l'exemple : elle privilégie un ensemble entièrement accessible dans le budget de 50 résultats, sans beauté, coiffure, automobile, fleuristes ou magasins de cuisine/décoration déjà couverts ailleurs. La liste peut être modifiée dans ce seul fichier.

| Limite globale | Taille de page métier | Appels métiers maximum | Localisation | Total maximum |
| --- | ---: | ---: | ---: | ---: |
| 20 | 5 | 6 | 1 | 7 |
| 50 | 10 | 8 | 1 | 9 |

Le budget est partagé entre tous les secteurs d'une demande contenant Artisans B2C. Les premières pages des différents métiers passent avant la pagination ; aucune requête supplémentaire dès que la limite globale est atteinte. Avec huit métiers et huit appels maximum, le lot de 50 explore au plus leur première page. Les autres secteurs conservent leur budget historique : 1 ou 4 appels métiers, plus la localisation. Aucun détail Google appelé automatiquement par résultat, aucun retry automatique. La taille de page et les tokens respectent la [référence Google](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText).

Les requêtes restent biaisées géographiquement puis contrôlées par distance côté serveur : le biais Google seul n'est pas un filtre strict. Les limites 20/50 comptent les entreprises acceptées après dédoublonnage et, en mode « nouvelles », après exclusion des entreprises déjà traitées.

## Identité, activité, autres secteurs

Dédoublonnage des résultats par Place ID, téléphone normalisé (+33/0), domaine sans www, nom normalisé et adresse. Les alias des résultats répétés sont mémorisés pour éviter de les recompter. Les exclusions persistantes existantes ne sont pas retirées : clients et prospects selon leurs clés d'identité ; ignorés selon leur Place ID, conformément au workflow existant.

`category` conserve `primaryTypeDisplayName` de Google quand disponible, sinon le métier recherché. `subcategory` conserve toujours la requête de découverte et survit à l'import. Le champ Google est ajouté au masque de recherche pour éviter de remplacer une activité précise par la catégorie interne.

Mappings clarifiés : bars/cafés → bar, café ; beauté → institut de beauté ; coiffure → salon de coiffure ; sport → salle de sport ; automobile → garage automobile ; habitat → magasin aménagement maison ; services locaux → pressing, cordonnier, toilettage animaux. Restaurants, commerces et loisirs conservent leurs libellés. Pas de refonte de ces secteurs ni de hausse de leur budget.

## Observabilité et validation

Logs serveur `[PROSPECTION_SEARCH]` et `[PROSPECTION_DISCOVERY]` : requêtes métiers tentées, total d'appels incluant la localisation, résultats bruts, entreprises uniques examinées, doublons, hors rayon, exclus et détail client/prospect/ignoré. Aucun secret, nom de contact ou payload Google. L'interface signale le budget épuisé ; un résultat partiel n'est pas présenté comme un recensement exhaustif.

Contrôle réel après correction avec les exclusions Firestore Production lues sans écriture : 50 nouvelles entreprises, 6 métiers, 7 appels, 56 résultats bruts, 4 doublons, 1 hors zone, 1 prospect déjà connu exclu. Aucun import et aucun email. Ce résultat constitue une observation, pas une garantie de réponses Google identiques à l'avenir.

La recherche est exécutée dans la route Next.js `/api/admin/prospection`. Aucun fichier Firebase Function ni SMTP n'est modifié ; seul le déploiement Vercel automatique de main est nécessaire.
