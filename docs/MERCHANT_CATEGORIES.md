# Catégories commerçant — audit du 23 septembre 2026

## Source constatée

Audit en lecture seule du projet `proxi-play-odzp2e`, base `(default)` : aucune collection dédiée aux catégories, ni document de catégories dans `app_config`. Les 55 documents `enseignes` contiennent 10 libellés distincts dans **`category: string[]`** (49 documents renseignés, 5 sans champ, 1 tableau vide). Aucun identifiant, slug, ordre ou statut actif/inactif n'est associé à une catégorie. Les 134 jeux n'ont aucun champ `category`, `categories` ou `commerce_type` renseigné. Aucune collection `merchants` non vide n'a été trouvée.

Le modèle mobile `backend/schema/enseignes_record.dart` confirme `List<String> category`. Sa constante `FFAppConstants.Category` dans `lib/app_constants.dart` contient les mêmes dix libellés. Elle n'est pas recopiée dans l'admin : la demande est une sélection alimentée par Firestore, pas une seconde liste statique.

## Source utilisée

`loadMerchantCategories` lit uniquement `enseignes.category` (projection Firestore), puis `categoriesFromEnseignes` dédoublonne et trie les valeurs en français. `GET /api/admin/marchands/categories` est réservé aux administrateurs et désactive le cache HTTP. Il ne retourne aucune autre donnée commerçant. La liste n'est ni écrite ni migrée.

Valeurs proposées à la date de l'audit, dans l'ordre alphabétique d'affichage :

- Alimentation
- Autre activité de proximité
- Beauté & bien-être
- Loisirs, sport & culture
- Maison, jardin & bricolage
- Mode
- Restaurants & bars
- Services & artisans
- Tourisme & événements
- Véhicules & mobilité

Le libellé complet constitue aussi la valeur stockée. Par exemple :

```json
{"category":["Loisirs, sport & culture","Maison, jardin & bricolage"]}
```

Les virgules appartiennent aux libellés : la conversion texte ↔ tableau de l'ancien formulaire pouvait les découper. Les trois formulaires utilisent désormais des tableaux de bout en bout.

## Création, édition et compatibilité

Le composant commun `MerchantCategorySelect` propose des cases à cocher, une recherche insensible aux accents et des sélections retirables. Il est utilisé par `CommerceFields` (création et page d'édition) et par `MerchantEditModal`. Pas de création libre. Chargement, erreur avec réessai et liste vide ont un état explicite. Une erreur de lecture ne vide jamais les sélections existantes.

En édition, les valeurs enregistrées sont présélectionnées et restent intactes lors d'une modification d'un autre champ. Une valeur sélectionnée absente de la réponse, ou explicitement inactive dans le contrat du composant, reste visible avec « ancienne catégorie » et peut être retirée ; une option inactive n'est pas proposée à l'ajout.

**Limite du modèle actuel :** Firestore ne possède aucun statut actif/inactif de catégorie. Toutes les valeurs utilisées dans les enseignes sont donc proposées. Le statut inactif d'un commerce ne rend pas sa catégorie inactive. Une valeur historique encore stockée sur une enseigne fait toujours partie de la liste ; on ne peut pas la déclarer obsolète sans référentiel supplémentaire. Aucun statut n'est inventé ni aucune valeur supprimée automatiquement.

Les secteurs de prospection Google Places sont une taxonomie de recherche distincte ; ils ne sont pas remplacés par les catégories de fiches enseignes. Aucun autre sélecteur de catégories enseignes n'a été trouvé dans la création de jeux. Le chargeur reste réutilisable pour les prochains consommateurs de cette même donnée.

## Validation et périmètre

Tests unitaires des libellés et tableaux, tests réels Chrome du formulaire (sélection multiple, recherche, retrait, valeurs anciennes/inactives, erreur/réessai, absence de saisie libre, liste vide), tests API sur émulateurs Firestore/Auth (lecture protégée, création et modification sans découpage des libellés), TypeScript, lint ciblé et build Next.js.

Aucune écriture de données de production dans ce chantier et aucune Firebase Function à déployer. Les modifications locales Jeux et Prospection sont préservées dans le worktree initial et exclues du commit.
