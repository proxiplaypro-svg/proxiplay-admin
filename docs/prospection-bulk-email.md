# Prospection : téléphone et lots V1

`phone` est un paramètre commercial, par défaut `07 59 60 69 86`. Une valeur vide supprime la ligne. Les paramètres ne s'appliquent qu'aux nouvelles générations ; préparer un lot conserve les brouillons existants.

## Fonctionnement

La callable admin existante `prospectEmail` expose `batch_prepare`, `batch_current`, `batch_get`, `batch_confirm`, `batch_step`, `batch_retry`. Aucune nouvelle Function, aucun nouveau transport SMTP, aucun changement de secret ni de règles Firestore. Les documents `prospection_email_batches` sont accessibles uniquement via le SDK Admin ; aucune règle client ne les autorise.

La préparation exige 1 à 50 IDs (limite serveur avant dédoublonnage), un email public primaire, aucune opposition et aucun journal pour la proposition actuelle. Les exclusions sont expliquées. Les brouillons propres à chaque prospect sont générés seulement s'ils n'existent pas ; un destinataire déjà édité différent du primaire entraîne une exclusion, pas un remplacement silencieux.

La confirmation affiche From et Reply-To provenant du transport existant. Elle autorise les étapes du lot persistant, sans envoyer elle-même. Chaque étape serveur choisit un seul prospect et réutilise la transaction d'envoi individuel : relecture du primaire, de l'opposition, de l'identifiant et de la révision, réservation du journal, SMTP, puis historique et statut après succès. Les statuts avancés du workflow existant sont conservés.

## Cadence et reprise

Un verrou Firestore partagé entre tous les lots et instances garantit une seule tentative groupée à la fois. Attente minimale de 30 secondes après chaque tentative : au plus 120 tentatives groupées/heure, hors durée SMTP. Bail de 150 secondes, supérieur au timeout de la callable (120 secondes). Les autres Functions et les envois individuels ne sont pas modifiés par ce verrou.

Audit : le transport existant ouvre une connexion par message, sans pool ni limite distribuée. La documentation OVH indique 200 emails/heure/compte et 300/heure/IP : [diagnostic officiel](https://docs.ovhcloud.com/en/guides/web-cloud/email-and-collaborative-solutions/troubleshooting/diagnostic-advanced). Ce choix conserve de la marge mais ne garantit pas la délivrabilité ni une capacité disponible si le compte est utilisé par d'autres services. Aucun quota commercial particulier au compte n'est supposé.

Le navigateur demande les étapes ; le serveur décide de la cadence, du destinataire et des contrôles. Fermer/rafraîchir la page suspend le traitement après la requête courante. La reprise est explicite depuis « Reprendre / consulter le dernier lot ». Aucun traitement détaché après la fin d'une invocation, aucune campagne planifiée.

Le lot stocke des références de proposition et des états, pas une copie de chaque corps. Les journaux et historiques existants portent `batch_id`. L'identifiant de proposition reste la clé d'idempotence et le Message-ID SMTP.

Un succès journalisé n'est jamais rejoué. Un crash ou une réponse SMTP incertaine n'est jamais repris automatiquement, même après expiration du bail. Seul un refus SMTP explicite 4xx/5xx permet « Réessayer uniquement cet email », avec nouvelle confirmation après la fin du lot, même clé et nouveau contrôle transactionnel. Une panne Firestore après acceptation SMTP reste à vérifier : SMTP ne fournit pas de transaction atomique avec Firestore et ne permet pas de promettre un résultat exactement-une-fois.

## Livraison et tests

Tests avec émulateurs et transport simulé exclusivement. Déployer uniquement :

```sh
firebase deploy --project proxi-play-odzp2e --only functions:prospectEmail
```

Région/runtime inchangés : europe-west1 / Node.js 20. Déployer cette callable avant l'interface. Aucun appel d'envoi nécessaire pour vérifier la livraison.
