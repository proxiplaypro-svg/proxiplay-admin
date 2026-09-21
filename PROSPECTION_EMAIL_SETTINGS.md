# Complément : paramètres commerciaux et test interne

Ce complément à `12c5f336db57cb2410e87409dd028724aa33506a` reste sur `feat/prospection-email-v12`. Aucun déploiement ni email réel n’a été effectué.

## Paramètres

L’écran `/admin/settings` est un placeholder sans stockage dynamique : aucun système de paramètres existant n’était réutilisable. La section « Paramètres commerciaux » de Prospection utilise donc le document privé `prospection_internal/commercial_settings`, déjà couvert par les règles serveur uniquement.

Les valeurs initiales sont `connections_per_day: 350`, `download_url: https://onelink.to/jx4ee7`, `website_url: https://www.proxiplay.fr`, `sender_name: Pascal`, `signature: Proxiplay – Jouez la proximité !`. Tous ces champs sont modifiables dans l’admin. Le document est persisté lors du premier enregistrement, avec révision, acteur et date. Avant cet enregistrement, les valeurs initiales sont appliquées.

Le générateur lit ces paramètres lors de chaque nouvelle génération. Un champ connexions vide est conservé comme `null` et supprime entièrement la phrase de fréquentation. Les brouillons existants ne sont jamais réécrits par un changement de paramètres : il faut les régénérer volontairement. Le nombre initial demeure uniquement dans la configuration par défaut, plus dans le texte du modèle.

## Audit Firebase Production du 21 septembre 2026

Projet interrogé par API en lecture seule : `proxi-play-odzp2e`, région `europe-west1`. Les métadonnées de Cloud Functions et de Secret Manager ont été consultées ; aucune valeur de secret n’a été lue ni affichée.

`sendMerchantEmail` est ACTIVE. `prospectEmail` est absent (réponse 404) : il n’a donc pas encore d’environnement de production. Les variables d’une fonction existante ne sont pas automatiquement héritées par une nouvelle fonction.

| Variable | Production `sendMerchantEmail` | Fichier Firebase local de préparation |
|---|---|---|
| OVH_SMTP_HOST | Présent | Présent |
| OVH_SMTP_PORT | Présent | Présent |
| OVH_SMTP_USER | Présent | Présent |
| OVH_SMTP_PASS | Présent : secret lié, version active disponible dans Secret Manager | Absent du fichier, normal : secret séparé |
| OVH_SMTP_FROM | Présent | Présent |
| OVH_SMTP_REPLY_TO | Manquant, facultatif | Manquant, facultatif |
| ADMIN_EMAILS | Manquant | Manquant |

Sans `OVH_SMTP_REPLY_TO`, le nouveau module utilise l’adresse From. Sans `ADMIN_EMAILS`, la garde conserve sa liste de secours existante ; l’absence de variable ne signifie donc pas accès public. Préférer une liste explicite et cohérente entre Firebase et l’admin avant mise en production.

Le fichier local audité est `functions/.env.proxi-play-odzp2e`, sans affichage de ses valeurs. Aucun de ces paramètres n’est présent dans `.env.local`. Cela ne constitue **pas** un audit des variables Vercel distantes, qui n’ont pas été interrogées. Next.js utilise sa configuration Firebase et sa propre liste admin ; SMTP est utilisé uniquement par Firebase Functions. Une variable Vercel n’est jamais considérée comme une variable Firebase.

## Export et déploiement ciblé

Un seul export Firebase Prospection Email : **`prospectEmail`**, déclaré dans `functions/index.js`. Les opérations `settings_get`, `settings_save`, `test_prepare`, `test_send` sont des actions de cette même callable, pas de nouvelles fonctions exportées.

Seule cette fonction doit être déployée pour la fonctionnalité :

```sh
firebase deploy --project proxi-play-odzp2e --only functions:prospectEmail
```

Commande fournie, **non exécutée**. Il n’est pas nécessaire de redéployer `sendMerchantEmail`, les autres fonctions, les règles Firestore ou des index. Le transport existant est inclus dans le code de la nouvelle fonction.

## Test interne

Après déploiement et publication autorisés, utiliser « Paramètres commerciaux » → « Configurer la prospection », enregistrer les paramètres, puis « Préparer l’email de test ». Le serveur impose comme destinataire l’adresse du compte admin authentifié et utilise le même générateur et le même transport OVH. Aucun destinataire arbitraire fourni par le client n’est accepté.

La préparation affiche l’email sans l’envoyer. « Envoyer le test à mon adresse » ouvre une confirmation explicite. Le brouillon et la tentative sont conservés dans `prospection_internal/email_tests/attempts/{hashUid}`. Une transaction autorise **une seule tentative par compte admin**, y compris après refresh ou requêtes concurrentes. Aucun prospect ni historique commercial n’est modifié. Si le résultat est incertain, aucun retry automatique : vérifier la boîte et les traces serveur avant toute intervention. Une nouvelle tentative après échec nécessite une réconciliation administrative du document, hors de cette interface V1.

## Étapes exactes pour la production (non exécutées)

1. Prendre le nouveau commit de la branche. Vérifier les paramètres de `functions/.env.proxi-play-odzp2e` dans l’environnement qui fera le déploiement : les fichiers locaux ignorés par Git ne sont pas transférés avec le push. Réutiliser le secret `OVH_SMTP_PASS` existant, sans l’ajouter à un fichier ni au navigateur.
2. Configurer explicitement `ADMIN_EMAILS` pour les administrateurs attendus côté Firebase et s’assurer de sa cohérence côté admin Next.js. Configurer `OVH_SMTP_REPLY_TO` si les réponses doivent arriver dans une autre boîte que From.
3. Exécuter la commande de déploiement ciblée ci-dessus après autorisation. Vérifier ensuite la présence des paramètres et la liaison du secret sur **`prospectEmail` elle-même**.
4. Publier la version admin contenant le nouveau commit via le processus Vercel habituel, après autorisation distincte.
5. Se connecter avec le compte admin dont l’adresse email est une boîte que vous contrôlez ; ouvrir Prospection et enregistrer les paramètres commerciaux.
6. Préparer le test, relire le destinataire et le message, puis confirmer **une fois**. Vérifier réception, expéditeur et Reply-To dans la boîte destinataire. SMTP accepté n’est pas une preuve de réception.
7. Seulement après cette vérification, générer/régénérer une proposition prospect, la relire et confirmer son envoi individuel.

## Validation du complément

- 11 tests unitaires Email, incluant chiffre modifié, champ vide, liens et signature.
- 14 tests d’intégration Firestore, incluant paramètres persistants, concurrence, garde admin et test interne à destinataire imposé.
- 1 parcours UI Chrome isolé, étendu aux paramètres, à l’effacement du chiffre et à la confirmation du test interne ; tous les envois sont simulés, requêtes externes bloquées.
- 19 tests Prospection, dont parcours des imports client vérifiant l’absence des credentials/providers serveur dans le navigateur.
- TypeScript, build Next.js et lint ciblé : réussis.

Total : **45 tests réussis**. Tests d’intégration exécutés sur Firestore local 1.21, port 8188. Aucun envoi SMTP réel, aucune mutation des réglages de production.
