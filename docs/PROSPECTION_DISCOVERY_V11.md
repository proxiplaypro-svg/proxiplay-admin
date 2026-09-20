# Prospection — découverte V1.1

## Périmètre et audit

Branche : feat/prospection-discovery-v11, base main/origin/main f67f296a51ca565380fa38fbc223f427c4f3bb9d.
Les quatre modifications locales jeux sont exclues. Aucun enrichissement IA, email ou changement des commerçants, jeux et utilisateurs. Aucun merge main ni déploiement manuel.

V1 appelait POST https://places.googleapis.com/v1/places:searchText pour résoudre la localisation puis une seule page par secteur. Le masque comprenait id, displayName, formattedAddress, location, addressComponents, nationalPhoneNumber, websiteUri, googleMapsUri et primaryTypeDisplayName. Aucun nextPageToken demandé/exploité : une catégorie était donc limitée à 20 résultats.

Documentation officielle vérifiée le 20 septembre 2026 :
- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText
- https://developers.google.com/maps/documentation/places/web-service/place-details

Text Search (New) propose pageToken/nextPageToken, 20 résultats par page et actuellement 60 par requête. Les paramètres sont conservés entre les pages. Les résultats ne sont ni exhaustifs ni garantis stables.

## Stratégie et plafonds

| Choix | Appels établissements maximum | Localisation | Maximum total |
| --- | --- | --- | --- |
| 20 | 1 | 1 | 2 |
| 50 | 4 | 1 | 5 |
| 100 | 8 | 1 | 9 |

Les limites sont globales, tous secteurs et zones confondus. La première catégorie sélectionnée est prioritaire ; un petit budget peut donc être consommé avant les autres catégories. Le résultat signifie « jusqu’à N établissements uniques disponibles », états confondus, et non N nouveaux prospects importables.

1. Résoudre le centre avec une seule requête de localisation.
2. Parcourir les secteurs dans leur ordre de sélection et les pages natives, trois pages maximum par requête.
3. Pour 100 seulement, si nécessaire et si le budget reste disponible, répéter dans quatre zones de biais à 45/135/225/315 degrés, dont les centres sont décalés de 55 % du rayon initial ; le rayon de biais vaut aussi 55 %. Ce sont de nouveaux appels Text Search, pas une pagination inventée.
4. Filtrer chaque établissement par sa distance au centre ORIGINAL. Sans coordonnées, il est exclu. Dédupliquer exclusivement par Place ID entre réponses Google.
5. Arrêter immédiatement au nombre demandé, au budget, à l’épuisement des requêtes. Token absent/répété : arrêt de la pagination courante. Pas de retry automatique ni de Place Details par résultat. Timeout de 15 secondes par appel.

Les biais Google ne constituent pas des restrictions strictes et peuvent retourner les mêmes établissements ; le filtre de distance et le dédoublonnage restent obligatoires. Une recherche 100 peut donc retourner beaucoup moins de 100. Le budget borne les coûts par action, pas le nombre d’actions qu’un administrateur peut déclencher.

## Endpoints, masques et coût

Localisation : POST /v1/places:searchText, FieldMask : places.location (Text Search Pro).

Recherche : même endpoint, FieldMask exact :

`places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,nextPageToken`

Enrichissement explicite existant : GET /v1/places/{placeId}, un appel hors budget de recherche. FieldMask exact :

`id,displayName,formattedAddress,location,addressComponents,nationalPhoneNumber,websiteUri,googleMapsUri,primaryTypeDisplayName,rating,userRatingCount`

primaryTypeDisplayName est conservé seulement pour les détails, où il alimente la catégorie absente ; la recherche utilise déjà le secteur demandé. Aucun wildcard, avis textuel, photo, horaire ou résumé demandé.

nationalPhoneNumber, websiteUri, rating et userRatingCount déclenchent Enterprise pour Text Search et Place Details. Les deux premiers existaient déjà : les notes ajoutées ne font pas monter le niveau de la V1. La multiplication des pages/requêtes augmente néanmoins les appels facturables. Chaque page est un appel. Le prix monétaire dépend des conditions du compte, volumes et crédits ; aucun montant universel n’est supposé.

## Données et exclusions

Les prospects importés conservent google_place_id, google_maps_url, fetched_at, téléphone/site et les nouveaux champs google_rating et google_user_rating_count. Champs absents : null, sans note ni compteur inventé. Valeurs numériques finies et bornées ; nombre d’avis entier positif ou nul. L’enrichissement existant complète seulement les valeurs absentes ; il ne remplace pas une valeur manuelle. La note n’est pas un score commercial.

Exclusions : prospection_internal/discovery/ignored/{google_place_id}. Cette collection privée est séparée des prospects pour ne pas polluer leur suivi, compteurs ou statuts commerciaux. Elle conserve les données de l’établissement, ignored_at et ignored_by. Le Place ID est validé comme identifiant Firestore ; aucun nom d’entreprise ne sert de clé.

La priorité est client > prospect > ignoré > nouveau. Les exclusions correspondent uniquement au Place ID. Les heuristiques de doublons prospects/clients de V1 (téléphone, domaine, etc.) sont conservées. Un client ou prospect ne peut pas être ignoré via cette action. La liste Ignorés permet de supprimer l’exclusion ; une réactivation ne supprime pas un prospect ou client existant.

Ignorer, réactiver et importer utilisent le même verrou transactionnel que les écritures V1. Le serveur recontrôle l’exclusion lors de l’import, y compris avec une sélection obsolète. Les actions restent réservées aux administrateurs. La route annotate actualise les états sans aucun appel Google. Les sélections sont recalculées après ces actions ; Tout sélectionner et le compteur se limitent aux résultats actuellement nouveaux. Un changement concurrent dans une autre session peut encore bloquer des lignes lors de l’import ; les rejets restent affichés.

Les règles existantes refusent tout accès SDK direct à prospection_internal/** ; aucun nouveau fichier de règles, index composite ni migration n’est nécessaire. Les lectures et tris restent adaptés à un volume modéré.

## Vérifications et limites

Tests unitaires : pagination 20/50/100, plafonds, arrêt anticipé, recouvrement de pages, rayon, tokens répétés/absents, parsing des notes, valeurs absentes, priorités, sélection et graphe des dépendances navigateur.
Tests API sur demo-prospection uniquement : tests V1 et exclusions persistantes, réactivation, import obsolète, concurrence import/exclusion, autorisations et règles Firestore sur la sous-collection.

Contrôles : test:prospection, tests API Auth/Firestore locaux (JAR Firestore 1.21.0 disponible), tsc --noEmit, build Next.js et ESLint ciblé. Build avec une clé sentinelle factice puis inspection des bundles navigateur pour vérifier l’absence de clé/provider. Aucun appel Google réel facturable pendant les tests.

Restent à valider manuellement : parcours dans une session admin et pertinence réelle des recherches géographiques élargies. Aucun résultat exhaustif ni quota de 100 établissements garanti. Aucun déploiement Firebase ou Vercel lancé manuellement ; un push de branche peut déclencher une Preview via l’intégration Git existante.

Résultat final : 17/17 tests unitaires et 12/12 tests API réussis ; TypeScript, build et lint ciblé sans erreur ni avertissement. 58 bundles navigateur inspectés, aucune référence à la clé sentinelle, au nom de la variable serveur ou au provider Google.

Fichiers : app/admin/prospection/page.tsx ; app/api/admin/prospection/route.ts ; components/admin/prospection/ProspectFields.tsx ; lib/prospection/model.ts ; lib/prospection/provider.ts ; lib/prospection/server.ts ; prospection.test.ts ; prospection-api.test.ts ; ce rapport.
