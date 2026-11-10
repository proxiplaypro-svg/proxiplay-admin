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

**À relire, non publié.** Ce paragraphe est à ajouter à la section « 11.
Cookies et Suivi » de `legal-content.json` du site.

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

## 7. À vérifier sur Vercel Preview

Ces vérifications demandent un déploiement, non autorisé à ce stade.

1. **Redirection transmise telle quelle par la réécriture entre projets.**
   Avec `node scripts/check-qr-redirect.mjs <url>/bus https://onelink.to/jx4ee7`,
   la réponse doit être une 302, avec `Location` vers OneLink et
   `Cache-Control: no-store`. La redirection ne doit pas être suivie par le
   proxy.
2. **Chaîne d'adresses de `/c/<chemin>?param=…`** : la requête doit arriver
   à l'Admin. Les paramètres d'URL ne sont pas transmis à la destination,
   volontairement.
3. **En-tête `x-forwarded-for` reçu par l'Admin.** Il doit contenir
   l'adresse du téléphone, pas celle du proxy du site. Sinon, mettre
   `QR_BURST_WINDOW_MS=0`.
4. **`after()`** : le compteur doit s'incrémenter après la réponse, y
   compris lors d'un démarrage à froid.
5. **Protection des déploiements Preview** : si l'Admin Preview est protégé,
   le proxy du site recevra une 401. Ordre recommandé :
   1. publier l'Admin en production, où la route est sans effet tant
      qu'aucune campagne n'existe (chemin inconnu : redirection vers
      l'accueil) ;
   2. créer `bus_dunkerque` **à préparer** ;
   3. tester le site en Preview. Les ouvertures de test sont alors comptées
      « hors période ».

## 8. Déploiement, plus tard et avec validation

1. **Admin.** Branche `feat/qr-campaigns`, créée à partir de `b60697c`,
   c'est-à-dire l'arbre exact de la production Admin du 07/11 (303 fichiers
   sur 303). Déployer en production depuis cette branche, par la même voie
   que d'habitude.
2. **Créer la campagne** depuis l'Admin :

   | Champ | Valeur |
   |---|---|
   | Identifiant | `bus_dunkerque` |
   | Nom | `Bus Dunkerque` |
   | Chemin | `bus` |
   | Canal | Bus |
   | Destination | `https://onelink.to/jx4ee7` |
   | Statut | À préparer |

3. **Site.** Branche `feat/qr-campaigns`, créée à partir de `1351fa9`,
   c'est-à-dire l'arbre exact de la production du site du 04/11 (150
   fichiers sur 150). Faire la Preview et les contrôles de la section 7,
   puis la production.
4. **Lancement.** Fixer la date de lancement, passer la campagne « Active »
   et télécharger le QR en PNG.
5. **Politique de confidentialité** : publier le paragraphe de la section 5
   après relecture.
