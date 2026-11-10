# Campagnes QR

Document du 10/11/2026, préparé localement. Rien n'est déployé et aucune
campagne n'existe en production.

## 1. Parcours

1. Le QR code encode `https://proxiplay.fr/bus` : l'URL publique, jamais la
   destination.
2. Vercel redirige `proxiplay.fr` vers `www.proxiplay.fr` (308, déjà en place).
3. Le `vercel.json` du site réécrit l'adresse, sans redirection visible :
   - `/bus` vers `https://admin.proxiplay.fr/api/public/qr/bus` ;
   - `/c/<chemin>` vers `…/api/public/qr/<chemin>`, pour les campagnes
     suivantes, sans redéployer le site.
4. La route publique de l'Admin (`app/api/public/qr/[slug]/route.ts`)
   répond aussitôt par une **302** vers la destination, avec les en-têtes
   `Cache-Control: no-store`, `Referrer-Policy: no-referrer` et
   `X-Robots-Tag: noindex`.
5. Le comptage s'exécute **après l'envoi de la réponse**, avec `after()` de
   `next/server`. C'est le mécanisme officiel, que Vercel exécute via
   `waitUntil`.

### En cas de panne

| Situation | Comportement |
|---|---|
| Lecture Firestore de plus de 500 ms, ou en erreur | Redirection vers la dernière destination connue de l'instance, sinon vers `https://onelink.to/jx4ee7` |
| Pendant les 10 s qui suivent un échec | Pas de nouvelle attente : repli immédiat |
| Écriture du compteur en erreur ou de plus de 3 s | Erreur journalisée, sans adresse IP ni navigateur. Aucun effet pour l'utilisateur. |
| Chemin inconnu ou invalide | Redirection vers l'accueil du site, sans comptage |
| Destination enregistrée invalide | Jamais suivie : redirection vers le lien de téléchargement |

## 2. Données Firestore

Aucune règle Firestore n'est à modifier : sans règle correspondante, les
applications n'ont aucun accès. Seuls les serveurs de l'Admin lisent et
écrivent ces données.

- `qr_campaigns/{id}`, par exemple `bus_dunkerque` : nom, chemin, destination,
  statut (`draft`, `active`, `paused`, `archived`), canal, lancement,
  création et dernière modification.
- `qr_campaign_slugs/{chemin}` : copie de la destination, du statut et du
  lancement. La redirection lit **un seul document**. Il est mis à jour dans
  la même transaction que la campagne.
- `qr_campaigns/{id}/changes/{auto}` : journal des modifications (qui,
  quand, avant et après).
- `qr_campaigns/{id}/hourly_stats/{AAAA-MM-JJ_HH_n}` : compteurs par heure de
  Paris, répartis sur 4 documents (`n` = 0 à 3) pour absorber les pointes.
  - Champs : `opens`, `ios`, `android`, `other`, `excluded_automated`,
    `outside_campaign`, `fallback_redirects`.
  - **Une seule écriture par ouverture.**

## 3. Ce qui est mesuré

| Mesure | Définition |
|---|---|
| Ouvertures enregistrées | Requêtes `GET` de l'URL, campagne active et lancée, hors robots et hors rafales |
| Par jour et par heure | Heure de Paris, changements d'heure compris |
| Appareils estimés | iPhone/iPad, Android ou autre, d'après le navigateur annoncé, qui n'est jamais enregistré |
| Robots, aperçus de liens, préchargements | Redirigés, comptés à part, jamais dans les ouvertures |
| Hors période | Campagne à préparer, en pause, archivée, ou pas encore lancée : redirigée, comptée à part |
| Redirections de secours | Destination de repli utilisée |

**Ce qui n'est pas mesuré :**
- les scans ;
- les visiteurs uniques : il n'y a ni cookie ni identifiant ;
- les téléchargements, les installations et les inscriptions.

**Requêtes non comptées :**
- `HEAD` ;
- une même origine (adresse et navigateur) revenue dans les 30 secondes.
  L'empreinte est gardée en mémoire seulement, jamais stockée. On peut la
  désactiver avec `QR_BURST_WINDOW_MS=0`.

**Plafond de coût** : 20 000 écritures par instance et par jour. Au-delà, la
redirection continue sans comptage.

## 4. Coûts estimés

Une écriture par ouverture et au plus une lecture par minute et par instance.
Tarif multirégion `eur3`, à confirmer sur la grille Google en vigueur.

| Ouvertures par jour | Écritures par mois | Firestore |
|---|---|---|
| 100 | 3 000 | environ 0,01 $ |
| 1 000 | 30 000 | environ 0,06 $ |
| 10 000 | 300 000 | environ 0,55 $ |

- **Statistiques sur 30 jours** : au plus 2 880 lectures (24 h × 4
  documents × 30 jours), soit moins de 0,002 $.
- **Vercel** : une invocation de fonction de l'Admin par ouverture, dans les
  quotas d'une offre payante. Le proxy de réécriture du site n'est pas une
  fonction.

## 5. Projet de paragraphe pour la politique de confidentialité

**Intégré** au commit du site `591d952` (section 13 du texte de référence
`politique-confidentialite-rgpd.md` et du `RGPD.pdf` publié, version du 11/11/2026).

> **Mesure des campagnes de communication (QR codes).** Lorsque vous ouvrez
> une adresse de campagne ProxiPlay (par exemple proxiplay.fr/bus, affichée
> dans les bus ou sur nos supports), notre serveur vous redirige
> immédiatement vers le téléchargement de l'application. Il ajoute une unité
> à des compteurs statistiques agrégés : date et heure de l'ouverture, et
> catégorie d'appareil (iPhone ou iPad, Android, autre), déduite des
> informations techniques transmises par votre navigateur. Aucun cookie
> n'est déposé. Ni votre adresse IP ni les informations de votre navigateur
> ne sont enregistrées dans ces statistiques : elles ne sont utilisées qu'au
> moment de la redirection, notamment pour écarter les robots et les
> ouvertures répétées en quelques secondes. Ces statistiques anonymes
> servent à mesurer l'efficacité de nos campagnes, sur le fondement de notre
> intérêt légitime. Notre hébergeur peut conserver des journaux techniques
> de connexion pour la sécurité du service.

**À noter :**
- La politique publiée ne mentionne pas non plus Google Analytics, déjà
  chargé après consentement sur le site. C'est un écart existant, à traiter
  dans la même mise à jour.
- Tout fichier du dépôt du site est publié. Exemple :
  `www.proxiplay.fr/docs/audit-ux-v2.md` répond 200. Ce projet de
  paragraphe est donc volontairement rédigé dans l'Admin.

## 6. Vérifications locales effectuées

- **Tests sans émulateur** : `npm run test:qr`. Ils couvrent les
  validations, les appareils, les robots, l'heure de Paris, l'agrégation,
  les pannes et lenteurs Firestore, les rafales, le plafond, le QR en PNG
  2048 px relu module par module, et le panneau de statistiques dans Chrome.
- **Tests sur émulateurs** : `npm run test:qr-api`. Ils couvrent :
  - les droits d'accès (401 sans jeton, 403 pour un joueur) ;
  - la création de `bus_dunkerque` ;
  - les doublons et les refus ;
  - le changement de destination à URL constante ;
  - le journal des modifications ;
  - 40 ouvertures simultanées, réparties sur au plus 4 documents ;
  - les statistiques.
- **Bout en bout local** : `npm run test:qr-e2e`, avec `next build`, `next
  start` et l'émulateur.
  - Cas normal : 302 en 11 à 55 ms et comptage effectué après la réponse.
  - Base injoignable : 302 vers OneLink, 514 ms pour la première requête
    puis 6 à 7 ms.

## 7. Vérifications sur Vercel Preview (10/11/2026)

### Isolation

- **Base de test.** Projet Firebase dédié `proxiplay-qr-preview` :
  Firestore `eur3`, aucune facturation. Compte de service limité au rôle
  `roles/datastore.user`.
- **Variables Vercel.** Les `FIREBASE_*` de l'Admin sont partagées
  Production et Preview. `getQrDb()` refuse donc la production dès que
  `VERCEL_ENV=preview` : vérifié, une Preview sans base de test redirige en
  secours et n'écrit rien.
- **Variables d'exécution par déploiement.** `vercel deploy --env` n'a pas
  été appliqué à ce projet (deux essais, variables absentes à l'exécution).
  Les identifiants de test ont donc été passés par `--build-env`, avec une
  modification **temporaire, non commitée** de `next.config.ts` (`env`).
  Aucune variable de projet n'a été modifiée.
- **Production intacte.** Les déploiements Preview n'ont reçu aucun alias.
  `www.proxiplay.fr`, `proxiplay.fr` et `admin.proxiplay.fr` sont restés
  sur leurs déploiements de production. La base de production contient 0
  document `qr_campaigns`, `qr_campaign_slugs` et `hourly_stats`.
- **Protection Vercel.** Elle est active sur les deux projets : sans
  contournement, la Preview renvoie vers `vercel.com/sso-api`. Les tests
  ont utilisé le secret « automation-bypass » existant, sans changer de
  réglage. Pour la Preview du site, une copie non commitée avait ce secret
  dans la destination de la réécriture ; ces Previews ont été supprimées.

### Résultats (`scripts/check-qr-redirect.mjs` et en-têtes de diagnostic)

| Vérification | Résultat |
|---|---|
| `/bus` sur le site Preview, réécrit vers l'Admin Preview | 302 transmise telle quelle, `Location: https://onelink.to/jx4ee7`, `no-store`, sans page intermédiaire ni boucle |
| iPhone, Android, robot, HEAD | 302 pour tous ; iPhone et Android comptés, robot écarté, HEAD non compté |
| Adresse reçue par l'Admin à travers la réécriture | Empreinte d'origine identique en direct et via le site, une seule adresse transmise : l'adresse du téléphone arrive bien |
| Rafale | Même requête rejouée dans les 30 s : `burst`, non comptée |
| `after()` | Compteurs écrits après la réponse, y compris au démarrage à froid |
| Démarrage à froid | Première requête entre 1,4 et 2 s. Lecture Firestore de plus de 500 ms : redirection de secours, comptage différé |
| Charge : 30 et 60 ouvertures simultanées via le site | 100 % de 302 vers OneLink, 100 % comptées après correctif, environ 2,3 s par requête, à cause des démarrages à froid des instances |
| Base indisponible (Preview sans base de test) | 302 vers OneLink, aucune écriture |
| `/c/inconnu`, `/c/BUS`, `/busx`, `/joueurs/`, `/` | accueil (302) ; OneLink, comptée ; 404 du site ; 200 ; 200 |
| `/bus?utm_source=…` | 302 vers OneLink, comptée ; paramètres non transmis |
| API d'administration | 401 sans jeton, 401 avec un jeton invalide (après correctif ; c'était 500) |

### Anomalies corrigées pendant ces tests

1. **Comptage perdu sur une instance froide** : 20 ouvertures comptées sur
   60. La lecture lente est désormais partagée, elle remplit le cache, et le
   comptage l'attend après la réponse.
2. **Jeton invalide → 500** sur les routes QR : c'est maintenant 401.

### Non vérifié sur Vercel

- **L'interface de l'Admin** : création, modification, statistiques et
  téléchargement du QR. Il faut se connecter en administrateur dans un
  navigateur. Ces points sont vérifiés localement (émulateurs et Chrome).
  Sur l'Admin Preview, les routes QR lisent et écrivent la base de test.
- **Les destinations autres que OneLink au démarrage à froid** : la
  redirection de secours va vers OneLink le temps de la première lecture.
  C'est sans effet pour `bus_dunkerque`, dont la destination est OneLink.

## 8. Mise en production (chaque étape sur accord explicite)

État vérifié le 11/11/2026 :

| | Admin | Site |
|---|---|---|
| Production actuelle | `dpl_4UThEKBMwu6AABfybbp3TUmFM5wL` (07/11), arbre `b60697c` | `dpl_8LoRL9RdZeXe1gnKpTVwrSgrYaRT` (04/11), arbre `1351fa9` |
| Commit à déployer | `005ecd4` | `591d952` |
| Écart avec la production | uniquement les fichiers des campagnes QR | réécritures QR et politique de confidentialité |

Aucun déploiement plus récent ni aucune modification locale ne serait écrasé.

### Ordre

1. **Admin en production** depuis `wt-admin-qr-campaigns` (`005ecd4`), par
   la voie habituelle : `vercel deploy --prod` depuis le worktree lié au
   projet `proxiplay-admin`.
   - Aucune variable n'est à créer : les `FIREBASE_*` de production
     servent tels quels.
   - En production, `getQrDb()` utilise la base de l'Admin, les en-têtes
     de diagnostic et le délai de test sont inactifs.
   - Contrôle : `https://admin.proxiplay.fr/api/public/qr/bus` doit
     répondre par une 302 vers `https://www.proxiplay.fr/`, puisque la
     campagne n'existe pas encore.
2. **Créer la campagne** dans l'Admin, rubrique Campagnes QR :
   identifiant `bus_dunkerque`, nom `Bus Dunkerque`, chemin `bus`, canal
   Bus, destination `https://onelink.to/jx4ee7`.
   - Elle est créée « À préparer ».
   - C'est la **première écriture en production**.
   - Contrôle : `node scripts/check-qr-redirect.mjs https://admin.proxiplay.fr/api/public/qr/bus https://onelink.to/jx4ee7`
     doit tout renvoyer OK. Les ouvertures de test sont comptées « hors
     période ».
3. **Site en production** depuis `wt-site-qr-campaigns` (`591d952`) :
   `vercel deploy --prod` depuis le worktree lié au projet
   `proxiplay-website`.
   - Contrôles :
     - `node scripts/check-qr-redirect.mjs https://proxiplay.fr/bus https://onelink.to/jx4ee7`
       (la redirection `proxiplay.fr` vers `www` est suivie
       automatiquement par le navigateur ; le script contrôle
       `https://www.proxiplay.fr/bus`) ;
     - pages `/`, `/joueurs/`, `/mentions-legales/` ;
     - nouveau `RGPD.pdf` ;
     - scan du QR sur Android et iPhone.
4. **Lancement**, au moment voulu : passer la campagne « Active »,
   éventuellement avec une date de lancement. À partir de là, les
   ouvertures sont comptées.

### Retour arrière

- **Site** : `vercel rollback dpl_8LoRL9RdZeXe1gnKpTVwrSgrYaRT --scope proxiplaypro-svgs-projects`.
  `/bus` redevient une 404 et l'ancienne politique de confidentialité
  revient.
- **Admin** : `vercel rollback dpl_4UThEKBMwu6AABfybbp3TUmFM5wL --scope proxiplaypro-svgs-projects`.
  Faire d'abord le retour arrière du site, sinon `/bus` renverrait une
  erreur.
- **Campagne seule** : statut « En pause ». La redirection continue et
  n'est plus comptée.
- **Changer de destination** se fait dans l'Admin, sans toucher au QR
  code imprimé.
- **Comptage en panne** : la redirection n'en dépend jamais. Firestore lent
  ou indisponible entraîne une redirection de secours vers
  `https://onelink.to/jx4ee7`.
- **Données** : les documents `qr_campaigns`, `qr_campaign_slugs` et leurs
  sous-collections sont propres à cette fonctionnalité. Ils peuvent rester
  en place après un retour arrière, car aucune autre fonction ne les lit.

### Après la mise en production

Supprimer l'environnement de test : les Admin Preview `mc1x7njbm` et
`8g4rhep14`, la clé du compte de service `qr-preview`, et éventuellement
le projet `proxiplay-qr-preview`.
