# Audit des catégories Proxiplay → Google Places

Configuration serveur unique : `lib/prospection/searchConfig.ts`. L'interface conserve ses 11 catégories ; le fournisseur Google traduit la sélection en métiers concrets. Une catégorie inconnue est rejetée avant tout appel Google. Les variantes de casse, accents et séparateurs sont normalisées.

| Catégorie Proxiplay | Mode | Requêtes Google utilisées |
| --- | --- | --- |
| Restaurants | A — simple | restaurant |
| Bars / cafés | B — multi | bar ; café |
| Commerces | B — multi | boutique de vêtements ; fleuriste ; bijouterie ; opticien ; magasin de chaussures ; librairie ; épicerie ; caviste ; boutique de cadeaux ; magasin de jouets ; papeterie ; chocolaterie ; pâtisserie ; boulangerie ; animalerie ; magasin de téléphonie ; magasin informatique ; mercerie |
| Beauté | A — simple | institut de beauté |
| Coiffure | A — simple | salon de coiffure |
| Sport | B — multi | salle de sport ; studio de yoga ; studio de pilates ; salle d'escalade ; magasin de sport |
| Loisirs | B — multi | bowling ; escape game ; parc de loisirs ; cinéma |
| Automobile | B — multi | garage automobile ; concessionnaire automobile ; lavage automobile ; centre de contrôle technique |
| Habitat | B — multi | magasin de meubles ; magasin de décoration ; cuisiniste ; magasin de literie ; magasin de bricolage ; magasin électroménager |
| Services locaux | B — multi | pressing ; cordonnier ; toilettage animaux ; photographe ; agence de voyages ; imprimerie |
| Artisans B2C | B — multi | plombier ; électricien ; peintre en bâtiment ; menuisier ; paysagiste ; couvreur ; chauffagiste ; serrurier |

A désigne un métier explicite adapté à une recherche textuelle simple. B désigne un regroupement nécessitant plusieurs recherches. Les mots internes « commerces », « habitat », « services locaux » et « artisans B2C » ne sont jamais transmis comme requête métier.

## Arbitrages de périmètre

Les 22 métiers proposés pour Commerces sont couverts : 18 dans Commerces, décoration/ameublement/électroménager dans Habitat, magasin de sport dans Sport. Beauté, coiffure, restauration et automobile conservent leurs requêtes spécialisées. Les requêtes Commerces ne se répètent dans aucune autre catégorie. Google peut toutefois classer un établissement dans plusieurs activités ; le dédoublonnage traite ces recouvrements, sans garantir une classification parfaite de Google.

## Diversification, exclusions et pagination

- Requêtes entrelacées entre secteurs sélectionnés. Dans chaque secteur, priorité aux métiers les moins représentés parmi les clients, prospects et ignorés persistants, lorsque leur activité enregistrée correspond à un métier configuré.
- Multi-métiers : petites pages de 5 résultats pour une limite de 20, de 10 pour une limite de 50. Chaque métier passe avant la pagination des précédents. Les métiers configurés ne sont donc pas tous interrogés à chaque recherche.
- Résultats affichés en round-robin : un établissement par métier, puis le suivant. Avec des pages pleines, Commerces interroge quatre métiers pour 20 résultats et cinq pour 50. Les résultats réellement disponibles peuvent déséquilibrer cette répartition.
- Fusion et dédoublonnage par Place ID, téléphone normalisé, domaine et nom/adresse normalisés. Rayon contrôlé côté serveur après la réponse Google.
- Clients (`enseignes` et `merchants`), prospects et ignorés exclus avant de compter la limite, dès la recherche initiale comme pour « Trouver 50 nouvelles entreprises ». Les exclusions sont relues à chaque recherche et revérifiées après les appels Google.
- Le bouton de nouveau lot conserve les critères et demande 50 résultats. Après import ou exclusion, les entreprises traitées ne consomment plus la limite du lot suivant. Les entreprises seulement affichées restent éligibles.
- Arrêt dès 20/50 entreprises exploitables, à épuisement des pages ou au plafond d'appels. Aucun appel automatique de détails par résultat. Une modification concurrente après la recherche peut réduire le lot lors de la dernière vérification, sans appel supplémentaire.

## Budget maximal par recherche

| Sélection | 20 résultats | 50 résultats |
| --- | --- | --- |
| Multi-métiers ou plusieurs catégories | **7 appels** : 1 localisation + 6 recherches | **9 appels** : 1 localisation + 8 recherches |
| Une catégorie simple | 2 appels : 1 localisation + 1 recherche | au plus 5 appels configurés : 1 localisation + 4 recherches ; pagination limitée à 3 pages, donc 4 appels effectifs actuellement |

Le plafond est partagé par toutes les catégories sélectionnées, jamais multiplié par le nombre de métiers. Pas de retry automatique Google. Un lot peut contenir moins de 20/50 résultats si le budget, les exclusions ou l'offre locale le limitent. Les métriques exposent les appels réellement effectués et l'atteinte du budget. Le nombre d'appels ne constitue pas une estimation tarifaire.

Les paramètres `pageSize`, `pageToken`, le biais de localisation et le masque de champs suivent la [documentation officielle Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search). Le biais pouvant renvoyer des lieux hors zone, le rayon est aussi filtré localement.

## Validation

Résultat du 22 septembre 2026 : 58 tests unitaires et 17 tests API réussis ; TypeScript et ESLint ciblé réussis. Aucun déploiement effectué.

Tests communs Artisans et Commerces : mapping des 11 catégories, absence de requête abstraite, plusieurs métiers, fusion, diversité et ordre round-robin, doublons, limites 20/50, plafond global, arrêt anticipé, secteurs inconnus et rayon. Tests API avec Firestore/Auth émulés : exclusions persistantes, import et nouveau lot de 50, sans réapparition des entreprises traitées. Les réponses Google sont simulées ; aucune mesure de pertinence sur Google en production n'est revendiquée.

Commandes :

```powershell
node --import tsx --test prospection.test.ts prospection-artisans.test.ts prospection-sectors.test.ts
firebase emulators:exec --project demo-prospection --only firestore,auth "node --import tsx --test prospection-api.test.ts"
npx tsc --noEmit
```
