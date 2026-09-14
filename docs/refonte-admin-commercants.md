# Refonte de la création et de la gestion des commerçants

Travail local uniquement : aucun déploiement, commit ou push. Les modifications préexistantes concernant les jeux sont conservées.

1. **Parcours initial audité**

   `/admin/marchands/nouveau` affichait deux champs (`name`, `email`) et appelait `POST /api/admin/marchands` sans jeton. Cet endpoint appelait Firebase Admin `createUser`, puis écrivait une enseigne à l’identifiant du compte. Aucun document `users` n’était créé. Aucun contrôle administrateur n’était effectué sur cet endpoint. Le navigateur envoyait ensuite un email avec `sendPasswordResetEmail`.

   L’audit porte sur les types, lectures, écritures et règles présents dans le dépôt : `adminQueries.ts`, `dashboardQueries.ts`, `merchantsQueries.ts`, `gamesQueriesFixed.ts`, les pages commerçants, `GooglePlaceIdEditor.tsx`, les fonctions de statistiques et `firestore.rules`. Une lecture limitée du schéma en base a été tentée ; les identifiants Firebase Admin locaux sont incomplets. Le schéma de production et le parcours mobile ne sont donc pas certifiés par cet audit.

2. **Champs initialement écrits et validation**

   Auth : `email`, `displayName = name`, mot de passe aléatoire généré sur le serveur ; compte activé par défaut.

   Enseigne : `uid = uid Auth`, `email`, `name`, `created_at = serverTimestamp`, `status = "active"`, `commercial_status = "actif"`, `owner = "/users/{uid}"`, `owner_id = DocumentReference(users/{uid})`.

   Aucun champ de validation utilisateur n’était écrit. Les lecteurs du dépôt utilisent `user_role = "commercant"` et `account_status = "active"`. Les champs `role`, `approved`, `profile_completed` et `isProfessional` ne sont pas établis par le schéma du dépôt : ils ne sont pas ajoutés.

3. **Nouveau comportement**

   Formulaire en trois sections : Commerce, Compte commerçant, Options. Activation immédiate et email de définition du mot de passe cochés par défaut. Aucune approbation ultérieure. Trois modes : nouveau compte, association explicite d’un compte déjà commerçant, fiche commerce seule.

   Après validation serveur : création Auth, transaction atomique `users` + `enseignes`, envoi de l’email si demandé, retour à la fiche. L’échec de l’email conserve le commerce et indique comment renvoyer le message. Le formulaire bloque une nouvelle création après réception du succès.

   La fiche et son écran d’édition donnent accès à l’identité du commerce, coordonnées, catégories, description, photo, identifiant Google, suivi commercial, identité du propriétaire, activation et réinitialisation. Les jeux restent visibles dans la fiche. La modification de l’email vérifie l’unicité Auth et synchronise le profil ainsi que les commerces associés, car l’email participe encore aux droits historiques. Le changement de propriétaire utilise une association explicite, sans modifier silencieusement l’identité du compte.

4. **Fichiers modifiés ou ajoutés**

   - `app/admin/marchands/nouveau/page.tsx` : création complète et gestion des doublons.
   - `app/api/admin/marchands/route.ts` : authentification, validation et opérations administrateur.
   - `lib/admin/merchantSchema.ts` : normalisation des champs et des références propriétaire.
   - `lib/admin/merchantServer.ts` : création transactionnelle et gestion du compte/commerce.
   - `lib/admin/merchantClient.ts` : appels authentifiés.
   - `components/admin/commercants/CommerceFields.tsx` : champs commerce partagés.
   - `components/admin/commercants/MerchantAccount.tsx` : identité, statut, association et renvoi d’email.
   - `app/admin/commercants/[merchantId]/page.tsx` : accès à l’édition et panneau compte.
   - `app/admin/commercants/[merchantId]/edit/page.tsx` : édition métier ; seules les valeurs modifiées sont envoyées.
   - `lib/firebase/merchantsQueries.ts` : lecture propriétaire compatible et photo à nom unique pour préserver l’ancienne image si l’enregistrement échoue.
   - `app/globals.css` : cartes plus compactes et contraste explicite des formulaires.
   - `firestore.rules` : protection des rôles, statuts de compte et références propriétaire contre les écritures directes non autorisées.
   - `merchant-admin.test.ts`, `package.json` : tests et commande `test:admin-merchants`.
   - Ce rapport.

5. **Endpoint utilisé**

   `POST /api/admin/marchands` crée le commerce et, selon le mode, son compte.

   `GET /api/admin/marchands?merchantId=…` lit le compte associé sans cache.

   `PATCH /api/admin/marchands?merchantId=…` propose `profile` (commerce), `update` (compte), `associate` (propriétaire), `reset` (résolution de l’email Auth pour le renvoi).

   Les trois méthodes exigent un jeton Firebase et la liste administrateur déjà utilisée par `assertIsAdminRequest`. Aucune callable ajoutée. La création des comptes reste exclusivement dans Firebase Admin.

6. **Schéma final**

| Document | Champs créés |
| --- | --- |
| Auth | `email`, `displayName`, mot de passe aléatoire non exposé, `disabled = !active` |
| `users/{uid}` | `email`, `first_name`, `last_name`, `phone_number`, `user_role: "commercant"`, `account_status: "active"` ou `"inactive"`, `created_time` |
| `enseignes/{id}` | `name`, `category: string[]`, `description`, `address`, `area_code`, `city`, `phone`, `phone_number`, `site_web_url`, `google_place_id`, `imageUrl`, `created_at`, `status`, `commercial_status` ; avec compte : `email`, `owner`, `owner_id` |

   L’identifiant de la nouvelle enseigne est indépendant du compte : un compte peut être associé à plusieurs commerces. Aucun nouveau pointeur inverse n’est inventé dans `users`. La fiche seule ne crée ni Auth, ni utilisateur, ni propriétaire ; ses statuts sont `inactive` / `inactif`. Pour un compte existant, son profil et son activation sont conservés.

   L’édition utilise des mises à jour partielles. Les données historiques non modifiées (réseaux sociaux, notes, champs inconnus, anciennes représentations) restent intactes. Le statut commercial et les indicateurs d’activité restent distincts du statut de connexion du compte.

7. **Association propriétaire**

   `owner_id` est la référence canonique ; `owner` est maintenu comme chaîne `/users/{uid}` pour les lecteurs historiques. Les deux sont écrits ensemble. Les anciennes références `owner` de type DocumentReference restent lisibles. Une contradiction entre deux propriétaires bloque la gestion du compte. Le changement de propriétaire vérifie le propriétaire attendu en transaction pour éviter d’écraser une association modifiée entre-temps.

8. **Mot de passe et échecs partiels**

   Mot de passe initial aléatoire généré sur le serveur, jamais renvoyé à l’admin. Le mécanisme existant `sendPasswordResetEmail` envoie un lien de choix/réinitialisation ; il ne valide pas l’inscription. Aucune saisie directe de mot de passe dans l’admin.

   En cas d’échec avant transaction, suppression compensatoire du nouveau compte Auth. Une relecture vérifie d’abord si la transaction a réellement été enregistrée malgré une réponse perdue. Si le résultat ou la compensation ne peut pas être confirmé, un message demande une vérification technique et évite de supprimer aveuglément un compte lié. Auth et Firestore ne fournissent pas de transaction distribuée commune.

9. **Email déjà existant**

   Réponse 409. Si le document utilisateur indique `user_role = commercant` et que le compte n’est pas administrateur, le formulaire propose une association avec confirmation explicite. Les comptes joueurs, administrateurs ou sans profil commerçant sont refusés. Aucun utilisateur existant n’est converti ou écrasé silencieusement. Une fiche sans compte peut recevoir ultérieurement un compte commerçant existant.

10. **Vérifications effectuées**

   13 tests réussis sur Auth Emulator et Firestore Emulator : création active, création désactivée, doublon/association sans écrasement, fiche seule puis association, lien de mot de passe, refus des trois méthodes aux non-admin, rollback de création, préservation d’une ancienne fiche, modification/désactivation et rollback du compte, unicité/synchronisation/rollback de l’email, validation des champs/références, refus des écritures directes de privilèges/propriétaire, réponse de transaction perdue après commit.

   Build Next.js réussi ; TypeScript réussi ; ESLint ciblé sans erreur (trois avertissements déjà présents dans la fiche et les requêtes commerçants). `git diff --check` réussi.

   Commande habituelle : `npm run test:admin-merchants`. Dans cet environnement, le téléchargement de Firestore Emulator 1.22 a échoué à cause du certificat TLS. Les tests ont utilisé le JAR 1.21 déjà installé, lancé localement avec `--rules firestore.rules --project_id demo-admin-merchants`, puis Auth Emulator via `firebase emulators:exec --only auth` avec `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. Aucun test n’utilise la production.

11. **Limites et risques à vérifier avant toute mise en production**

   - La vérification visuelle n’a pas pu être exécutée : le connecteur Browser échoue pendant son initialisation avec une erreur de chemin de confiance. La compilation des pages est vérifiée.
   - L’email est testé dans l’émulateur ; sa délivrabilité réelle, son modèle et son domaine d’action restent à vérifier. L’import de photo n’a pas été essayé sur le stockage réel.
   - L’activation mobile dépend de son propre code, absent de cet audit. Aucun champ de validation supplémentaire n’a été supposé.
   - Les règles locales réservent désormais la création/suppression des enseignes aux admins et interdisent l’auto-attribution du rôle commerçant. Avant de les publier, vérifier que l’inscription autonome éventuelle du mobile passe par un backend autorisé. Les accès préexistants aux sous-collections sont conservés. Ces règles n’ont pas été déployées.
   - Les anciennes fiches sans document utilisateur restent éditables, mais leur ancien compte incomplet n’est pas promu automatiquement ; il faut associer un compte commerçant valide.
   - L’activation/désactivation concerne le compte entier, donc tous ses commerces. Le changement de propriétaire n’effectue pas de réécriture des anciens jeux ou des preuves QR liées au propriétaire précédent.
   - Les anciens objets de stockage sont conservés lors du remplacement/retrait d’une photo ; leur purge n’est pas automatisée.
