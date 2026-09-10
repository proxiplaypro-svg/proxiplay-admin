# UX Admin QR-only / VIP — 10 septembre 2026

## Parcours livré

Le formulaire de création existant n’a pas de champ supplémentaire. La création effective des jeux QR-only dans ce dépôt se fait dans `/admin/campaigns` (un jeu par commerce). `/admin/games/new` est actuellement un écran d’attente et n’a pas été transformé en nouveau formulaire.

Après écriture d’un nouveau jeu, l’Admin appelle `issueGameQrAccess({ gameId })`. La confirmation dédiée affiche « Jeu QR créé ✓ », le commerce, l’explication de l’accès en boutique, le QR, le téléchargement PNG et l’impression de l’affiche existante. « Terminer / Retour aux jeux » permet de quitter. Une création multiple affiche une carte par nouveau jeu. Un échec QR propose une nouvelle tentative sur le jeu déjà créé ; il ne relance pas la création du jeu.

La fiche `/admin/games/[gameId]` affiche « QR code boutique » en haut uniquement lorsque `access_mode === 'qr_only'`, y compris pour les jeux VIP utilisant ce mode. Les exports depuis l’édition, le générateur visuel, les campagnes et l’API PDF passent aussi par le lien sécurisé pour ces jeux.

## Génération et stockage

- Source existante, consultée sans modification : `../Proxiplay-develop/firebase/functions/game_qr_access.js`, export `issueGameQrAccess` dans `index.js`.
- Callable Firebase en région par défaut `us-central1`, comme le client mobile existant ; cette fonction n’utilise pas la région `europe-west1` des autres callables Admin.
- Le moteur génère 32 octets aléatoires, encodés en 64 caractères hexadécimaux. Il stocke le jeton dans la collection privée `game_qr_access/{gameId}`, avec `game_path`, `shop_path`, `owner_path`, `shop_owner_path`, `expires_at` et `issued_by`.
- L’Admin construit `https://play.proxiplay.fr/j/{gameId}?qr_token={token}`, conforme à `lib/utils/share_links.dart` de l’application. Aucun retour à `qr_link` ou `qrCodeUrl` générique pour un jeu QR-only.
- La route Admin GET authentifiée lit l’accès existant sans le créer ni le renouveler. Elle vérifie les rattachements et l’expiration selon le contrat du moteur et répond avec `Cache-Control: private, no-store`. Cette vérification ne remplace pas la validation transactionnelle lors de la participation.
- Les PNG sont produits avec la bibliothèque `qrcode` déjà installée, en mémoire. Pas de stockage du jeton dans le document public du jeu, ni dans localStorage. Pas de nouvelle collection, règle Firestore ou logique de génération de jeton.
- Le PNG de l’affiche QR-only est généré localement avec une marge blanche ; son impression ne dépend plus du script QR externe utilisé par les affiches publiques.
- La page de lancement locale `/j/[gameId]` conserve désormais `qr_token` pour les jeux QR-only et produit les liens `proxiplay://game/...` et `intent://game/...` attendus par l’application. La reconstruction précédente supprimait la preuve. Cette correction concerne le transport web, pas le moteur de participation.

## Anciens QR et limites

Une preuve encore valide est réutilisée à l’identique. L’Admin n’envoie jamais `rotate: true`. Une simple consultation, un téléchargement ou une impression n’écrit pas dans `game_qr_access`.

Sans preuve valide, la fiche affiche un avertissement et une action explicite « Générer le QR sécurisé pour réimpression ». Cette action utilisateur appelle le moteur existant ; aucune action de ce type n’a été exécutée sur des données réelles pendant ce travail. Un jeu terminé ou désactivé n’affiche pas de QR actif.

Les anciennes affiches sans `qr_token` sont incompatibles avec le moteur sécurisé : elles doivent être remplacées. Aucune migration, rotation en masse ou réécriture de liens n’a été effectuée. Si un document QR-only historique n’existe que dans `jeux`, l’export générique est bloqué : sa reprise dans `games` exige une décision séparée, car le moteur ne gère que `games`.

La disponibilité du callable sur l’environnement cible et la diffusion de l’application/page de lancement qui transportent `qr_token` n’ont pas été vérifiées en production. Le moteur exige `users/{uid}.user_role = admin` pour l’émission par un administrateur ; être admis par la liste d’emails de l’Admin web ne suffit pas à lui seul.

## Vérifications exécutées

- TypeScript : `node node_modules/typescript/bin/tsc --noEmit`, réussi.
- Build Next.js de production : réussi (compilation, TypeScript et génération des pages).
- ESLint ciblé : aucune erreur ; 10 avertissements préexistants de variables inutilisées dans la page campagnes.
- `secure-game-qr.test.ts` : 7 tests réussis sur Firestore et Auth Emulator. Lien conforme au mobile, jeton invalide, ancien QR sans écriture, conservation des preuves, expiration/rattachements incorrects, jeux terminés/publics, authentification et absence de cache, blocage du PDF générique QR-only.
- Suite existante `../Proxiplay-develop/firebase/functions/test/game_lifecycle_qr.test.js` : 4 tests réussis, sans modification du moteur. Émission/réutilisation, participation et gains, tentatives concurrentes, jeton d’un autre jeu, faux jeton/ancien booléen, permissions, expiration et révocation.
- Les essais utilisent exclusivement des projets `demo-*` sur émulateurs. Le téléchargement automatique du JAR récent rencontrait un problème de certificat ; le JAR local 1.21.0 a été utilisé avec `-Duser.language=en -Duser.country=US` pour éviter un défaut de ressources de traduction Java.

Commande reproductible de la suite Admin : `npm run test:admin-qr` (émulateurs installés requis).

## Recette manuelle restante — navigateur et téléphones

À effectuer sur un environnement de recette disposant du callable sécurisé et d’une application compatible. Ne pas utiliser de jeu réel pour les scénarios de révocation.

1. Créer une animation avec un commerce et un jeu QR-only futur/actif. Vérifier qu’aucun champ QR n’a été ajouté au formulaire, puis vérifier la confirmation et les trois actions. Répéter avec plusieurs commerces.
2. Télécharger le PNG. Scanner ce fichier puis l’aperçu Admin : même jeu et même `qr_token`. Ne pas copier les jetons dans des journaux ou captures partagées.
3. Cliquer « Imprimer l’affiche », vérifier l’aperçu A4, enregistrer en PDF et imprimer. Scanner le QR sur papier avec Android et iOS ; vérifier le commerce et le jeu exacts, puis une participation. Vérifier le transport du jeton par le lien HTTPS et la page de lancement jusqu’à l’application, y compris après connexion.
4. Revenir à la fiche : section « QR code boutique » immédiatement visible, mêmes téléchargements et impression. Recharger et comparer le QR ; aucune rotation. Vérifier également l’impression depuis l’édition, le générateur visuel et l’export de campagne.
5. Ouvrir un ancien jeu sans preuve : avertissement, aucun faux QR, aucune écriture en base. Tester explicitement la génération uniquement sur un jeu de recette ; réimprimer, puis scanner. L’ancien QR sans jeton doit être refusé par le moteur sécurisé.
6. Couper le réseau ou rendre le callable indisponible pendant une création : le jeu demeure créé, l’erreur est visible et « Réessayer » travaille sur le même identifiant. Bloquer les fenêtres surgissantes : l’échec d’impression doit être visible.
7. Ouvrir un jeu public : pas de section QR boutique, parcours existant conservé. Dans une campagne mixant QR disponibles et manquants, les QR disponibles restent exportables et les autres proposent « Vérifier le QR ».

Le scan physique et le rendu navigateur/imprimante ne sont pas certifiés par les tests d’émulateur. Aucune capture navigateur n’a été produite ; cette recette constitue la validation visuelle restante.

## Fichiers modifiés ou ajoutés

- `app/admin/campaigns/page.tsx`
- `app/admin/games/[gameId]/page.tsx`
- `app/api/admin/games/[gameId]/qr/route.ts` (ajout)
- `app/api/generate-poster/route.ts`
- `app/j/[gameId]/page.tsx`
- `app/j/[gameId]/OpenAppRedirect.tsx`
- `components/admin/jeux/GameQrSection.tsx` (ajout)
- `components/admin/jeux/PosterVisualGeneratorPage.tsx`
- `lib/admin/gamePoster.ts`
- `lib/admin/gameQrClient.ts` (ajout)
- `lib/admin/secureGameQr.ts` (ajout)
- `lib/admin/secureGameQrServer.ts` (ajout)
- `types/qrcode.d.ts`
- `package.json`
- `secure-game-qr.test.ts` (ajout)
- `docs/admin-qr-only-ux-recette.md` (ce document)

Aucun déploiement, push ou changement du GAME ENGINE.
