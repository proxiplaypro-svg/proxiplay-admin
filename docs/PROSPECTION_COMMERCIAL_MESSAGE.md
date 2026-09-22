# Message commercial et personnalisation métier

Le générateur et les règles sont centralisés dans `functions/src/prospect_proposal.js`. La génération individuelle et la préparation des lots lui transmettent les mêmes informations enregistrées : nom, activité (`category`) et métier de découverte (`subcategory`). Les paramètres commerciaux existants fournissent exclusivement la fréquentation, le téléchargement et la signature.

L'activité enregistrée est prioritaire, puis le métier de découverte si l'activité ne correspond à aucune règle. Aucun métier n'est déduit du nom de l'entreprise, de son URL ou des notes. Une activité contradictoire utilise le texte neutre. « Commerce » reste commerce même si le nom ressemble à un institut.

Règles : beauté/institut (prestation ou bon cadeau), restaurant (repas ou bon cadeau), coiffure (coupe/prestation/bon cadeau), sport (séance/découverte), loisirs (entrée/activité), commerce (produit/bon cadeau), artisan/habitat/services (lot choisi selon le métier), automobile (lot adapté). Les suggestions ne promettent pas une prestation gratuite pour les artisans.

L'objet suit l'accroche interrogative demandée quand la fréquentation est renseignée. Le corps parle exclusivement de connexions, sans affirmer un nombre d'utilisateurs uniques ni garantir leur exposition à l'entreprise. Sans fréquentation, l'objet devient « Faites découvrir {entreprise} avec Proxiplay » et le paragraphe de fréquentation disparaît. Le téléphone vide ne crée aucune ligne.

Les brouillons existants ne sont pas migrés. « Régénérer la proposition » demande confirmation pour tout brouillon existant, y compris les modifications non enregistrées, puis appelle l'action explicite `generate` avec `replace: true`. Le serveur refuse le remplacement sans ce marqueur. La génération relit les paramètres et l'activité actuels, et crée un nouvel identifiant ; elle n'envoie aucun email. La protection des envois en cours reste inchangée.

Les lots gardent les brouillons existants et appellent ce générateur séparément pour chaque brouillon absent. Une proposition régénérée après préparation d'un lot invalide sa référence précédente : le contrôle d'identifiant/révision empêche l'envoi d'un message non relu dans ce lot.

Tests : aperçu exact Institut Océane, règles et fallback prudent, signature et fréquentation, absence de promesse d'exposition, préservation des anciens brouillons, annulation/confirmation de régénération, génération individuelle et personnalisation distincte dans un même lot. SMTP reste simulé pendant tous les tests.

Livraison : seule la callable `prospectEmail` nécessite un redéploiement. Aucun autre paramètre SMTP, secret, Function ou workflow d'envoi n'est modifié.
