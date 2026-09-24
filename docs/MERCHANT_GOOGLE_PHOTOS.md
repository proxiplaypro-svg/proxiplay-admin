# Fiche commerce : Google et photos — 24 septembre 2026

## Livraison et périmètre

Suite du chantier catégories, déjà livré dans `8e1a8fb`. Branche `feat/merchant-google-photos`, créée depuis ce dernier main. Les modifications locales Jeux et mapping Prospection du worktree initial sont exclues. Le référentiel catégories reste celui documenté dans [MERCHANT_CATEGORIES.md](MERCHANT_CATEGORIES.md).

Création `/admin/marchands/nouveau` et édition `/admin/commercants/{merchantId}/edit` utilisent `CommerceFields`, `MerchantGoogleSelect`, `MerchantPhotos` et `useMerchantPhotos`. L'ancienne fenêtre rapide renvoie vers cette page pour Google/photos ; sa sauvegarde ne touche plus `imageUrl`.

## Google

Réutilisation de `GooglePlacesProvider`, de son transport Places API (New), de ses champs et de la clé **serveur** `GOOGLE_PLACES_API_KEY`. `POST /api/admin/marchands/google` vérifie l'authentification administrateur avec le mécanisme existant de l'admin.

Chaque clic de recherche produit **un seul appel Google**, Text Search `pageSize: 5`, nom + ville/adresse, français, délai maximum 15 secondes. Pas de pagination, de deuxième appel Details, de récupération de photos ni de sélection automatique. L'utilisateur peut modifier les termes, choisir explicitement un résultat, changer ou retirer l'association. La touche Entrée dans la recherche ne soumet pas la création du commerce.

Résultats affichés : nom, adresse, code postal/ville, téléphone, site, note et nombre d'avis, selon disponibilité. Le Place ID retourné est enregistré dans **`enseignes/{id}.google_place_id: string`**. Adresse, `area_code`, `city`, `phone` et `site_web_url` complètent seulement les champs vides. Les valeurs existantes différentes sont conservées, avec message explicite. Supprimer l'association laisse les coordonnées intactes. Les notes et avis ne sont pas ajoutés au document enseigne. Une association déjà enregistrée s'affiche avec les coordonnées de la fiche et un lien Maps, sans appel supplémentaire.

## Audit réel du modèle photos

Lecture seule du projet `proxi-play-odzp2e` : 55 enseignes, 48 Place IDs, un document avec `imageUrl` et **126 documents de galerie existants**. Galerie canonique : **`enseignes/{id}/images/{imageId}`**, champ **`url: string`**. Pas de création d'un tableau `photos` parallèle.

Le Flutter local confirme `ImagesRecord.url`, `add_image_urls_to_firestore.dart` et des requêtes `queryImagesRecordOnce(parent: enseigne, limit: 5)` **sans orderBy**, donc ordre naturel des identifiants Firestore. Aucun code Flutter modifié.

La sauvegarde conserve les emplacements de documents existants, crée des emplacements si nécessaire, les trie par identifiant puis place les données des photos dans l'ordre choisi. La première photo est donc première aussi pour les lecteurs Flutter existants. Les métadonnées des anciennes photos sont conservées. Le document parent reçoit aussi **`imageUrl = URL principale`**. Une ancienne couverture `imageUrl` ou `logo` absente de la galerie est présentée et conservée tant que l'admin ne la retire pas. Vider explicitement la galerie retire les couvertures de repli. Aucune conversion automatique à la lecture.

Nouvelles photos, dans la même sous-collection :

```json
{"url":"https://firebasestorage.googleapis.com/...","storage_path":"enseignes/ID/photos/UUID-0.webp","admin_upload":true}
```

Bucket existant : **`proxi-play-odzp2e.firebasestorage.app`**, obtenu via la configuration Firebase existante. Chemin : **`enseignes/{merchantId}/photos/{operationUUID}-{index}.webp`**. Aucun nom de fichier fourni par l'utilisateur n'est utilisé comme chemin. Le parent conserve un `photo_operation_id` pour rendre une reprise du même enregistrement idempotente.

## Photos, fiabilité et sécurité

- JPEG, PNG, WebP, plusieurs fichiers, miniatures, suppression, principale, déplacement avant. Maximum 5 photos pour une nouvelle galerie ; les galeries historiques plus longues ne sont pas tronquées à la lecture.
- Source jusqu'à 12 Mio par fichier et 60 mégapixels. Correction d'orientation, dimension maximale 1 600 px, WebP qualité 86 puis 76 si nécessaire ; repli 1 280/1 024 px pour tenir sous 650 Kio. Pas d'agrandissement. Le serveur valide le contenu réel avec Sharp, refuse les types usurpés et animations, limite les dimensions et réencode sans métadonnées EXIF.
- Sélection locale uniquement avant sauvegarde. En création, upload **après** obtention du merchantId : abandon du formulaire = aucun fichier Storage envoyé. En cas d'échec après création, bouton de reprise sur la fiche créée sans nouveau commerce ni nouvel email.
- Progression de transfert, états optimisation/enregistrement, messages de succès et erreur. Rechargement de galerie après erreur ou conflit, avec confirmation avant abandon des modifications locales.
- Routes GET/POST photos réservées aux administrateurs ; chemin enseigne validé, budget de corps 4 Mio déclaré, fichiers optimisés bornés. L'API spécifique utilise Firebase Admin Storage après contrôle admin.
- Transaction Firestore et empreinte de version : une galerie modifiée simultanément n'est pas écrasée. Les fichiers envoyés sont nettoyés après échec confirmé. Un accusé de transaction perdu est vérifié avant suppression ; si l'état distant ne peut pas être vérifié, on privilégie la conservation à la suppression d'une photo potentiellement attachée.
- Seuls les objets créés par ce service et retirés explicitement sont nettoyés. Les fichiers mobiles historiques, potentiellement partagés, ne sont pas supprimés. Un nettoyage Storage échoué après une sauvegarde réussie est signalé.

Règles Storage **déployées** auditées en lecture seule, ruleset `7ba8d17c-1639-4170-8b64-155dc8aa2d89` : accès administrateur déjà prévu. **Aucune règle Storage ou Firestore modifiée/déployée. Aucune Firebase Function nécessaire.** Aucun fichier Google Places copié.

## Validation

- `merchant-media.test.ts` : requête nom/ville, cinq résultats, champs, conflits, coût borné, erreurs/vide ; JPEG/PNG/WebP, orientation, dimensions, métadonnées, MIME/tailles invalides.
- `merchant-photos-api.test.ts` avec émulateurs Auth/Firestore et Storage simulé : galerie existante, couverture historique, compatibilité de l'ordre Flutter, métadonnées, upload/retrait, reprise idempotente, conflits et rollback, sécurité des routes et requêtes malformées.
- `merchant-media-ui.test.mjs` dans Chrome réel : sélection explicite, préremplissage et protection, changement/retrait, recherche manuelle, erreurs/vide ; optimisation réelle Canvas, miniatures, principale, suppression, taille/limite ; abandon sans upload ; création avec reprise sans doublon ; galerie existante ; ancienne fenêtre rapide.
- Non-régression : 17 tests administration commerçants, catégories unitaires et navigateur, 30 tests Prospection.
- TypeScript, lint ciblé, build Next.js. Les tests Google sont simulés : aucun appel Places facturé pour cette validation. Les écritures de tests restent sur les émulateurs, sans création de commerce ni transfert photo en production.

Aucune migration de données Production ; les galeries ne changent que lors d'un enregistrement explicite par l'admin après livraison. Les tests Storage utilisent un double contrôlé : un transfert réel avec une photo métier pourra être vérifié lors du premier usage autorisé dans l'admin.
