// Fonction Netlify : crée une session Stripe Checkout avec tous les articles du panier.
// Pas de dépendance npm requise : on appelle l'API REST de Stripe directement.
//
// Variable d'environnement requise (à définir dans Netlify, jamais dans ce fichier) :
//   STRIPE_SECRET_KEY = sk_test_... (ou sk_live_... une fois prête à encaisser pour de vrai)

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Clé Stripe manquante (STRIPE_SECRET_KEY non configurée sur Netlify)" }),
    };
  }

  let items;
  try {
    items = JSON.parse(event.body).items;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Requête invalide" }) };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Panier vide" }) };
  }

  const siteUrl = process.env.URL || `https://${event.headers.host}`;

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", `${siteUrl}/?paiement=succes`);
  params.append("cancel_url", `${siteUrl}/?paiement=annule`);

  items.forEach((item, i) => {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const amount = Math.round(Number(item.price) * 100);
    if (!item.name || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Article de panier invalide");
    }
    params.append(`line_items[${i}][quantity]`, String(qty));
    params.append(`line_items[${i}][price_data][currency]`, "chf");
    params.append(`line_items[${i}][price_data][unit_amount]`, String(amount));
    params.append(`line_items[${i}][price_data][product_data][name]`, String(item.name).slice(0, 250));
  });

  try {
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: session.error?.message || "Erreur Stripe" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
