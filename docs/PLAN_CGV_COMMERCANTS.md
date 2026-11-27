# Case « J'accepte les CGV » pour les commerçants — version simplifiée

Document destiné à Claude Code. Validé par Pascal le 27/11/2026.
**Rien n'est encore implémenté.**

Les numéros de ligne renvoient à la branche `integration/proxiplay-1.1.4` du dépôt
`Proxiplay-main-Mars2026` (identiques en 1.1.3) et peuvent avoir bougé : relis le
fichier avant de modifier.

---

## 1. Le besoin

1. **Création d'un compte commerçant dans l'app** : une case « J'accepte les
   CGV », obligatoire pour créer le compte.
2. **Commerçant déjà inscrit** : la même case, **une seule fois**, à sa prochaine
   connexion. Tant qu'elle n'est pas cochée, il n'accède pas à son espace.
3. **Trace côté admin** : l'admin voit, dans la fiche du commerçant, s'il a
   accepté, quelle version et quand.

Rien d'autre. Ne pas élargir le périmètre.

## 2. Règles de travail

- **Ne pas modifier** `firebase/firestore.rules` ni `firebase/storage.rules`.
- **Ne rien déployer** sans validation explicite.
- **Ne modifier aucune donnée de production.**
- **Déploiement des Functions** : ne jamais déployer depuis
  `integration/proxiplay-1.1.4` tant que la branche `phase1-t2b` n'y est pas
  fusionnée. Les fonctions de souscription V2.1 sont déjà en production depuis
  cette branche, et un déploiement sans elles risque de les supprimer.
  Signale-le avant tout déploiement.

## 3. Texte de la case (validé)

```
J'ai lu et j'accepte les conditions générales de vente PROXIPLAY (version 2.1, applicables à compter du 1er décembre 2026).
```

- « conditions générales de vente » est un **lien cliquable par simple appui**
  (`TextSpan` + `TapGestureRecognizer`, penser au `dispose`), qui ouvre
  `https://www.proxiplay.fr/legal-content/sections/CGV.pdf` dans le navigateur
  (`url_launcher`, déjà dans `pubspec.yaml`).
- Case **non précochée**.
- Version de référence : `2.1`.

Le texte et la version sont définis **une seule fois** de chaque côté :
- app : une constante dans un nouveau fichier `lib/utils/merchant_cgv.dart`
  (`kMerchantCgvVersion = '2.1'`, `kMerchantCgvCheckboxText`, `kMerchantCgvUrl`) ;
- Functions : les mêmes constantes dans `merchant_cgv_acceptance.js`.

Un test vérifie que les deux textes sont identiques (§8).

## 4. Données enregistrées

L'acceptation est écrite **uniquement par le serveur** (SDK Admin). L'app ne peut
pas écrire ces champs : les règles n'autorisent dans la fiche `users` que les
champs de profil listés dans `isSafeSelfUserUpdate` (`firestore.rules`) ; ces
nouveaux champs n'y sont pas, donc un client ne peut pas les falsifier.

**Dans la fiche du commerçant** `users/{uid}` (lue par l'app pour savoir s'il a
déjà accepté) :
```
cgv_accepted_version: "2.1"
cgv_accepted_at: Timestamp (heure serveur)
```

**Trace pour l'admin** `merchant_cgv_acceptances/{uid}/history/{version}` :
```
uid: string
email: string              // lu dans Firebase Auth côté serveur
cgv_version: "2.1"
checkbox_text: string      // texte exact de la case
accepted_at: serverTimestamp
source: "signup" | "login"
user_agent: string         // en-tête de la requête, tronqué à 300 caractères
```

- Aucune règle ne couvre `merchant_cgv_acceptances` : la collection est
  **refusée par défaut** à l'app et au site, et lisible par l'admin via le SDK
  Admin. Ne pas utiliser comme nom de sous-collection `participants`,
  `enseigne_game`, `horaires`, `images`, `winners`, `participants_details`
  ou `instant_winners`, qui sont couverts par des règles récursives.
- **Pas d'adresse IP.**
- L'identifiant `{version}` + écriture par `create()` : une seconde acceptation
  de la même version ne crée pas de doublon.

## 5. Functions (`firebase/functions`)

**Nouveau fichier `merchant_cgv_acceptance.js`**, une seule callable :

`recordMerchantCgvAcceptance` (région `kFunctionsRegion`, comme les autres) :
- authentification requise ;
- refus si `users/{uid}.user_role` n'est pas `commercant` ;
- entrée : `{accepted: true, source: "signup" | "login"}` ; refus si `accepted`
  n'est pas `true` ;
- dans une transaction :
  - `history/{version}` par `create()` ; s'il existe déjà, ne rien réécrire
    (succès idempotent) ;
  - mise à jour de `users/{uid}` : `cgv_accepted_version`, `cgv_accepted_at` ;
- retour : `{accepted: true, version: "2.1"}`.

**`index.js`** : exporter la callable.

Aucune autre fonction n'est modifiée.

## 6. App Flutter (`lib/`)

| Fichier | Changement |
|---|---|
| **nouveau** `lib/utils/merchant_cgv.dart` | Constantes du §3 et widget réutilisable de la case (texte + lien cliquable) |
| `lib/pages/auth/inscription_page/inscription_page_widget.dart` | **Onglet pro** : remplacer la case actuelle (`:3152-3271`, qui cite les CGU joueurs et n'ouvre la page légale que par appui long, `:3197-3201`) par le widget du §3. Le blocage existant reste (`:3335`). Après la création du compte, avec ou sans code (après `createAccountWithEmail` ou `signInWithEmail`, `:3410-3416`), appeler `recordMerchantCgvAcceptance` avec `source: "signup"`. En cas d'échec réseau, ne pas bloquer l'inscription : l'écran de connexion rattrapera |
| `lib/backend/schema/users_record.dart` | Lire `cgv_accepted_version` (String) et `cgv_accepted_at` (DateTime), sur le modèle des autres champs |
| **nouveau** `lib/pages/auth/merchant_cgv_page/merchant_cgv_page_widget.dart` (+ modèle) | Écran « Conditions générales de vente » : la case du §3, bouton « Continuer » désactivé tant qu'elle n'est pas cochée, bouton « Se déconnecter ». Au clic : appel avec `source: "login"`, rafraîchissement de la fiche (`refreshCurrentUserDocument`), puis routage normal. En cas d'erreur : message + « Réessayer » |
| `lib/flutter_flow/nav/nav.dart` | Route de cet écran (`requireAuth: true`) |
| `lib/auth/firebase_auth/account_routing_logic.dart` | Nouvelle cible `merchantCgvRequired` : pour un commerçant (`Roles.commercant`) dont `cgv_accepted_version` est vide, prioritaire sur `waitingValidation`, `rejected` et `commercantHome` |
| `lib/auth/firebase_auth/account_routing.dart` | Lire `cgv_accepted_version` dans les données déjà chargées par `resolveAuthenticatedHome` et transmettre à la logique ci-dessus |
| `lib/pages/auth/login_page/login_page_widget.dart` | Dans `_navigateFromResolution` (`:144-213`), envoyer la nouvelle cible vers l'écran CGV |

Pas de modification pour les joueurs.

## 7. Admin Next (`proxiplay-admin`)

| Fichier | Changement |
|---|---|
| `lib/admin/merchantServer.ts` | Dans `readMerchantAccount` (`:80-90`), qui lit déjà `users/{uid}`, renvoyer `cgvAcceptedVersion` et `cgvAcceptedAt` |
| `app/api/admin/marchands/route.ts` | Transmettre ces deux champs |
| `components/admin/commercants/MerchantAccount.tsx` | Afficher dans la fiche : « CGV v2.1 acceptées le JJ/MM/AAAA à HH:MM » ou « CGV non acceptées » |

La trace détaillée (`merchant_cgv_acceptances/{uid}/history`) reste consultable
par l'admin dans la console Firebase ; pas d'écran dédié.

## 8. Tests

**Functions** (émulateurs, modèle : `firebase/functions/test`) :
- non authentifié ⇒ refus ; joueur ⇒ refus ; `accepted` absent ou faux ⇒ refus ;
- commerçant ⇒ `users/{uid}` et `history/2.1` écrits, avec l'heure serveur ;
- deuxième appel ⇒ pas de doublon, date d'origine conservée ;
- texte stocké identique à la constante de l'app.

**Règles** (règles inchangées) : un commerçant ne peut ni écrire
`cgv_accepted_version` dans sa fiche, ni lire ou écrire
`merchant_cgv_acceptances/**`.

**App** (`flutter test`) :
- inscription : case non cochée ⇒ bouton bloqué ; lien ouvert par simple appui ;
- routage : commerçant sans `cgv_accepted_version` ⇒ écran CGV ; avec ⇒ routage
  habituel ; joueur ⇒ aucun effet ;
- écran CGV : « Continuer » désactivé tant que la case n'est pas cochée.

**Admin Next** : la fiche affiche « acceptées » ou « non acceptées ».

## 9. Limites connues

- Les téléphones restés en **1.1.3** ne verront la case qu'après la mise à jour
  de l'app.
- Si l'enregistrement échoue à l'inscription (réseau), le commerçant verra
  l'écran CGV à sa prochaine connexion.
- Une nouvelle version des CGV ne redemandera pas l'acceptation : ce n'est pas
  demandé ici.
