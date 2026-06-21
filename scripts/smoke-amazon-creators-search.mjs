const required = [
  "AMAZON_ASSOCIATE_TAG",
  "AMAZON_CREATORS_CREDENTIAL_ID",
  "AMAZON_CREATORS_CREDENTIAL_SECRET",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.log(`Amazon Creators smoke omitido: faltan ${missing.join(", ")}.`);
  process.exit(0);
}

const tokenRes = await fetch(process.env.AMAZON_CREATORS_TOKEN_URL ?? "https://api.amazon.co.uk/auth/o2/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    grant_type: "client_credentials",
    client_id: process.env.AMAZON_CREATORS_CREDENTIAL_ID,
    client_secret: process.env.AMAZON_CREATORS_CREDENTIAL_SECRET,
    scope: "creatorsapi::default",
  }),
});

if (!tokenRes.ok) {
  console.error(`Amazon Creators auth falló: ${tokenRes.status}`);
  process.exit(1);
}

const tokenData = await tokenRes.json();
const token = tokenData.access_token;
if (!token) {
  console.error("Amazon Creators auth falló: respuesta sin access_token.");
  process.exit(1);
}

const searchRes = await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-marketplace": process.env.AMAZON_MARKETPLACE ?? "www.amazon.es",
  },
  body: JSON.stringify({
    partnerTag: process.env.AMAZON_ASSOCIATE_TAG,
    keywords: process.argv.slice(2).join(" ").trim() || "Devil May Cry PS2 videojuego",
    searchIndex: process.env.AMAZON_SEARCH_INDEX ?? "VideoGames",
    itemCount: 3,
    resources: ["images.primary.medium", "itemInfo.title", "offersV2.listings.price"],
  }),
});

if (!searchRes.ok) {
  console.error(`Amazon Creators search falló: ${searchRes.status}`);
  process.exit(1);
}

const data = await searchRes.json();
const items = data.searchResult?.items ?? [];
console.log(`Amazon Creators OK: ${items.length} resultados.`);
for (const item of items.slice(0, 3)) {
  console.log(`- ${item.asin ?? "sin ASIN"} · ${item.itemInfo?.title?.displayValue ?? "sin título"}`);
}
