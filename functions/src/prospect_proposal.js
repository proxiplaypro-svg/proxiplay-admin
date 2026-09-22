const { DEFAULT_SETTINGS, parseSettings } = require("./prospect_settings");

// Match recorded activity only, never the business name, website or free-form notes.
// category contains the precise Google activity when available; subcategory is the discovery trade.
const RULES = [
  { sector: "beauty", match: /\b(beaute|esthetique|estheticienne|beauty|spa|onglerie|nail salon)\b/, sentence: name => `L'idée pour ${name} serait simple : proposer par exemple une prestation ou un bon cadeau à gagner. Votre établissement est alors présenté aux utilisateurs qui viennent tenter leur chance sur l'application.` },
  { sector: "restaurant", match: /\b(restaurant|restaurants|restauration|pizzeria|brasserie|creperie)\b/, sentence: name => `L'idée pour ${name} serait par exemple de faire gagner un repas ou un bon cadeau. Les utilisateurs découvrent ainsi votre établissement en venant tenter leur chance sur l'application.` },
  { sector: "hair", match: /\b(coiffure|coiffeur|coiffeuse|hair salon|hair care|barber shop|barbier)\b/, sentence: name => `L'idée pour ${name} serait par exemple de faire gagner une coupe, une prestation ou un bon cadeau afin de faire découvrir votre salon aux utilisateurs de l'application.` },
  { sector: "sport", match: /^(?!.*\b(magasin|boutique|store|shop)\b).*\b(sport|sports|fitness|gym|gymnase|salle de sport|yoga|pilates|escalade|fitness center|sports club)\b/, sentence: name => `L'idée pour ${name} pourrait être de faire gagner une séance, une formule découverte ou un bon cadeau afin de présenter votre activité aux utilisateurs locaux.` },
  { sector: "leisure", match: /\b(loisirs|loisir|bowling|escape game|cinema|parc de loisirs|amusement park|amusement center)\b/, sentence: name => `L'idée pour ${name} pourrait être de faire gagner une entrée ou une activité afin de faire découvrir votre établissement aux utilisateurs de Proxiplay.` },
  { sector: "automotive", match: /\b(automobile|automobiles|garage|car repair|car dealer|car wash|carrosserie|pneus|controle technique)\b/, sentence: name => `L'idée pour ${name} pourrait être de proposer un lot adapté à votre activité afin de présenter vos services aux utilisateurs locaux de manière plus originale.` },
  { sector: "services", match: /\b(artisan|artisans|habitat|services locaux|service local|plombier|plomberie|electricien|electricite|chauffagiste|chauffage|peintre|menuisier|menuiserie|couvreur|carreleur|macon|paysagiste|jardinier|serrurier|vitrier|renovation|amenagement maison|plumber|electrician|roofer|locksmith|general contractor|pressing|cordonnier|toilettage|photographe)\b/, sentence: name => `L'idée pour ${name} est de présenter votre activité aux utilisateurs locaux à travers un jeu simple, avec un lot que vous choisissez en fonction de votre métier et de vos objectifs.` },
  { sector: "retail", match: /\b(commerce|commerces|boutique|magasin|store|shop|fleuriste|florist|bijouterie|opticien|librairie|epicerie|caviste|papeterie|chocolaterie|patisserie|boulangerie|animalerie|mercerie|bakery|book store)\b/, sentence: name => `L'idée pour ${name} serait par exemple de faire gagner un produit ou un bon cadeau afin de faire découvrir votre boutique aux utilisateurs locaux.` },
];
const normalize = value => typeof value === "string" ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
function activityRule(prospect) {
  for (const source of [prospect.category, prospect.subcategory]) {
    const matches = RULES.filter(rule => rule.match.test(normalize(source)));
    // Generic shop/store is subordinate to a specific activity such as a barber shop.
    const specific = matches.filter(rule => rule.sector !== "retail");
    if (specific.length > 1) return null; // Conflicting activities: use the neutral fallback.
    if (specific.length === 1) return specific[0];
    if (matches.length === 1) return matches[0];
  }
  return null;
}
function personalization(prospect, name) {
  return activityRule(prospect)?.sentence(name) || `L'idée est de présenter ${name} aux utilisateurs locaux à travers un jeu simple, avec un lot adapté à votre activité.`;
}
const factualProposalGenerator = {
  async generate(prospect, settings = DEFAULT_SETTINGS) {
    settings = parseSettings(settings);
    const company = typeof prospect.name === "string" ? prospect.name.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500) : "";
    const name = company || "votre entreprise";
    const count = settings.connections_per_day;
    const subjectPrefix = count === null ? "Faites découvrir " : `Et si ${count} utilisateurs découvraient `;
    const subjectSuffix = count === null ? " avec Proxiplay" : " chaque jour ?";
    const subject = `${subjectPrefix}${name.slice(0, 200 - subjectPrefix.length - subjectSuffix.length)}${subjectSuffix}`;
    const traffic = count === null ? "" : `Proxiplay génère actuellement environ ${count} connexions par jour. L'objectif est simple : profiter de cette audience locale pour faire découvrir votre établissement de manière ludique.`;
    const signature = [settings.sender_name, settings.signature, settings.phone, settings.website_url].filter(Boolean).join("\n");
    const body = [
      "Bonjour,",
      "Je me permets de vous contacter car je développe Proxiplay, une application locale qui permet aux entreprises du Dunkerquois de se faire découvrir à travers des jeux et des cadeaux.",
      personalization(prospect, name),
      traffic,
      `Vous pouvez découvrir l'application ici :\n${settings.download_url}`,
      `Si le principe vous intéresse, je peux vous présenter rapidement le fonctionnement et ce que nous pourrions mettre en place pour ${name}.`,
      signature,
    ].filter(Boolean).join("\n\n");
    return { subject, body };
  },
};
module.exports = { factualProposalGenerator, activityRule, RULES };
