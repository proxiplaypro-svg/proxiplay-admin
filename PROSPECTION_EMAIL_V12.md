# Prospection email V1.2

Complément ultérieur : [paramètres commerciaux, audit Firebase Production et test interne](PROSPECTION_EMAIL_SETTINGS.md). Ce complément remplace le chiffre figé du modèle décrit ci-dessous par un paramètre modifiable.

Base auditée : `2714d724041eeae8ebaa54e83799159641401d20`.
Branche : `feat/prospection-email-v12`. Aucun déploiement ni email réel pendant les tests.

## Infrastructure auditée

- `functions/index.js` : Firebase Functions v2, région `europe-west1`, Nodemailer et SMTP OVH. `sendMerchantEmail` sert déjà les emails marchands, avec garde `assertAuthenticatedAdmin` et journalisation technique. Les politiques des emails opérationnels marchands restent distinctes et inchangées.
- `getMailerTransport()` centralise le transport et l’expéditeur. Il est réutilisé par le nouvel adaptateur `EmailSender` (`createOvhEmailSender`), sans deuxième provider ni copie de secret dans Next.js.
- Paramètres existants : `OVH_SMTP_HOST`, `OVH_SMTP_PORT` (587 par défaut), `OVH_SMTP_USER`, secret `OVH_SMTP_PASS`, `OVH_SMTP_FROM`, `OVH_SMTP_FROM_NAME`. From utilise `OVH_SMTP_FROM`, ou `OVH_SMTP_USER` si vide. Le nom d’affichage existant est conservé.
- Nouveau paramètre facultatif : `OVH_SMTP_REPLY_TO`, avec repli sur l’adresse From. Il doit correspondre à la boîte suivie par Pascal/Proxiplay. Aucune adresse effective ni valeur de secret n’a été inventée ou modifiée. La disponibilité des identifiants de production n’a pas été testée.
- `ADMIN_EMAILS` : même liste autorisée dans Next.js et Firebase Functions, à maintenir cohérente. Aucune confiance accordée à un indicateur admin envoyé par le navigateur.
- Pas de provider IA texte dans Prospection : `qualification.ts` produit déjà un brouillon factuel. `OPENAI_API_KEY` est utilisé ailleurs pour des fonds d’affiche, sans adaptateur de proposition commerciale existant. La V1.2 utilise donc un générateur factuel interchangeable sans appel IA ni clé supplémentaire.
- Fiche existante : API Next.js protégée, contrôle de révision, historique et statuts Firestore. Les règles interdisent déjà les accès SDK directs à `prospects/**` et `prospection_internal/**` : aucune nouvelle règle ni aucun index composite requis.

## Recherche publique et protections

La callable admin `prospectEmail` part du site enregistré sur la fiche, notamment importé depuis Google Places. Elle analyse l’HTML de l’accueil puis quelques liens Contact, À propos, Équipe ou Mentions légales présents sur la première page obtenue.

- Cinq requêtes HTTP maximum par prospect, **redirections comprises** ; aucun crawl récursif. Même hôte uniquement, à l’exception du préfixe `www` équivalent.
- Six secondes maximum par requête, DNS compris ; 512 Kio maximum par page ; 100 emails conservés au maximum.
- HTTP/HTTPS seulement, ports 80/443, aucun identifiant dans les URL. Contrôle de chaque redirection, pas de suivi automatique.
- DNS IPv4 contrôlé : refus des adresses privées, loopback, link-local, réservées, multicast et endpoints metadata connus. Adresse validée épinglée dans le socket : pas de seconde résolution vulnérable au DNS rebinding. Les sites accessibles uniquement en IPv6 ne sont pas pris en charge.
- Pas d’exécution JavaScript, de connexion, de contournement CAPTCHA ou de génération d’adresses. HTML et liens mailto explicites seulement ; scripts, styles, templates et commentaires exclus.
- Syntaxe, doublons et exemples filtrés. Domaine email égal au domaine du site, avec une liste limitée de messageries publiques courantes acceptées. Les domaines de prestataires externes sont ignorés. Une boîte de messagerie publique peut demander une revue manuelle du contexte.
- Classification conservatrice : `commercial`, `general`, `direction`, `other`. `named_professional` est prévu dans le modèle mais n’est pas inféré à partir de la seule adresse. Aucune identité de personne n’est déduite.
- Priorité proposée : commercial, général, direction, autre. Choix manuel de l’adresse principale possible. Les champs `email` et `contact_email` saisis manuellement ne sont jamais modifiés.
- Une nouvelle recherche conserve les adresses précédemment trouvées et leur source initiale, ainsi que le choix principal. Le résultat et les statistiques reflètent les coordonnées conservées après fusion.

## Modèle Firestore

Champs facultatifs ajoutés à `prospects/{id}` :

```text
emails[]: { email, type, source_url, discovered_at, is_primary }
email_enrichment_status: not_started | running | found | not_found | failed
email_enriched_at, email_enrichment_error, email_enrichment_token
do_not_contact: boolean
proposal: { id, revision, to, subject, body, status, sent_at? }
email_sending_id
```

Les anciens documents restent compatibles sans migration. `prospects/{id}/emails/{proposalId}` contient le journal : destinataire, objet, corps, acteur, dates de création/envoi, statut `sending/sent/failed`, identifiant provider et erreur normalisée. La fiche affiche les 100 derniers envois ; l’historique conserve les événements réussis. Aucun credential n’y est enregistré.

`prospection_internal/email_crawl_slots` porte un sémaphore transactionnel de trois places, commun à toutes les instances et tous les administrateurs. Les baux expirent après 90 secondes pour permettre une reprise après interruption. Un jeton de génération empêche un crawl en cours de réintroduire des coordonnées supprimées.

## Lot et interface

Sélection jusqu’à 50 prospects, traitée par étapes de trois côté serveur. Progression et totaux `found/not_found/failed`, plus nombre d’emails conservés, sont affichés après chaque étape. Une erreur de site n’interrompt pas le lot. Une saturation du sémaphore apparaît comme un échec réessayable. La fermeture de l’onglet arrête les étapes suivantes : il n’y a pas de campagne ni de tâche de fond durable.

La proposition reprend le texte fourni et, si nom et ville existent, une phrase factuelle les citant. Pas d’actualité, de dirigeant ou de compliment inventé. Le chiffre de 350 connexions/jour vient du brief et doit être réévalué avant les envois futurs. Le corps reste modifiable, de même que l’objet et l’unique destinataire. Le brouillon est persistant dès sa génération, puis enregistré avant confirmation d’envoi. « Copier » ne déclenche aucun envoi.

« Envoyer » ouvre une confirmation explicite avec Confirmer/Annuler. La confirmation porte sur une révision précise du brouillon. Aucun CC/BCC, aucune relance, aucun envoi par lot. `do_not_contact` est contrôlé côté serveur avant réservation de l’envoi.

La suppression des coordonnées enrichies efface les emails collectés, l’état d’enrichissement et le brouillon, en conservant les champs manuels, l’opposition au contact et le journal des emails déjà tentés/envoyés. La suppression complète du prospect supprime ses sous-collections, mais est bloquée pendant un envoi.

## Envoi, idempotence et limites SMTP

1. Une transaction vérifie l’admin, l’opposition, le brouillon et sa révision, puis réserve `emails/{proposalId}` en `sending` et verrouille le prospect.
2. L’adaptateur OVH réutilise le transport existant avec TLS requis et délais bornés. Il envoie un seul email texte et vérifie que le destinataire figure dans les adresses acceptées par SMTP.
3. Après acceptation seulement, une transaction inscrit `sent`, l’identifiant provider, l’événement d’historique, `last_contact_at` et fait passer `new/to_contact` à `contacted`. Les statuts plus avancés sont conservés.
4. Une même clé n’est **jamais rejouée**, même après erreur, refresh, requête répétée ou double clic. L’identifiant SMTP Message-ID est stable mais ne constitue pas à lui seul la garantie d’idempotence.
5. Un nouvel envoi nécessite une régénération volontaire et une nouvelle confirmation. Un échec est affiché sans faux succès ni historique d’envoi réussi.

SMTP n’offre pas une transaction atomique avec Firestore. Une déconnexion peut laisser le résultat incertain. Après un arrêt brutal ou une erreur de finalisation Firestore, le journal peut rester `sending` et bloquer tout nouvel envoi : il faut vérifier les traces OVH/la boîte d’envoi puis réconcilier le journal côté serveur avant de déverrouiller. **Ne jamais renvoyer automatiquement** ces cas. `sent` signifie accepté par SMTP, pas livré ni lu.

## Activation ultérieure et réponses

La nouvelle callable doit être déployée lors d’une intervention explicitement autorisée, puis l’admin publié. Aucun déploiement effectué dans cette tâche. Les paramètres SMTP existants sont réutilisés ; le seul ajout facultatif est `OVH_SMTP_REPLY_TO`. L’enrichissement et la génération utilisent aussi cette callable : ils seront disponibles après son activation. Aucun credential requis dans le navigateur, aucune nouvelle variable Next.js.

La détection des réponses n’est pas implémentée. Elle nécessitera un accès autorisé en lecture à la boîte destinataire du Reply-To (IMAP OVH ou connecteur entrant adapté), une synchronisation idempotente et la corrélation `In-Reply-To`/`References` avec le Message-ID conservé. Il faudra distinguer réponses humaines, absences automatiques et rebonds avant de mettre à jour `replied`.

## Validation locale

Résultats : **63 tests réussis** (19 Prospection, 15 API Prospection, 10 unitaires email/crawler, 12 intégration email, 1 parcours UI, 6 régressions emails marchands). TypeScript, build Next.js et lint ciblé réussis. Les tests incluent la panne Firestore après acceptation SMTP, les huit requêtes d’envoi concurrentes et le sémaphore partagé entre deux services.

Commandes reproductibles :

```text
npm run test:prospection
npm run test:prospection-api
npm run test:prospection-email
npm run test:prospection-email-api
npm run test:prospection-email-ui
npm run test:merchant-emails
npx tsc --noEmit
npm run build
npx eslint app/admin/prospection lib/prospection components/admin/prospection prospection.test.ts prospection-email-ui.test.mjs
```

Le test UI utilise Chrome headless, un profil isolé et la vraie section React ; la callable est remplacée par un simulateur local, avec blocage des requêtes externes. Définir `CHROME_PATH` si nécessaire. Les tests serveur injectent un faux expéditeur et exigent l’émulateur Firestore local ; aucun SMTP réel n’est appelé.

Sur cette machine, le téléchargement de Firestore 1.22 a rencontré un problème de certificat. La validation a utilisé le JAR local Firestore 1.21 (port 8188) et l’émulateur Auth (9099), avec `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` explicitement définis. Aucun assouplissement TLS ni accès aux données de production.
