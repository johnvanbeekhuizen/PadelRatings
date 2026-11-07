# Padelratings

Site met KNLTB-padelratings (dubbel) voor een groep spelers. Sorteert op rating, laagste bovenaan.
De rating wordt bij het openen van de pagina en met de knop "Vernieuwen" live opgehaald via een
kleine serverfunctie (`netlify/functions/rating.js`) die MijnKNLTB uitleest.

## Online zetten (Netlify, gratis)

Slepen van alleen de map werkt niet, want de serverfunctie moet mee. Met de command line:

    npm install -g netlify-cli
    netlify login
    cd padel-ratings
    netlify deploy --prod

Kies "Create & configure a new project" en laat de rest op de standaardwaarden staan
(publish `public`, functions `netlify/functions` staan al in `netlify.toml`).
Je krijgt een adres als `https://jouw-naam.netlify.app`.

## Controleren of het scrapen werkt

Open na het deployen:

    https://jouw-naam.netlify.app/api/rating?id=19496060&debug=1

- `ok: true` met naam en rating: alles werkt.
- `ok: false`: kijk bij `debug.log` welke pagina's zijn opgehaald en bij `debug.snippets`
  welke tekst rond "padel" op het profiel staat. Daarmee is `rating.js` snel bij te stellen
  (zoek op `parsePadelRating` en `findProfileLinks`).

## Let op

- MijnKNLTB heeft geen officiële API. De functie leest de gewone HTML-pagina's en kan
  stuk gaan als KNLTB de site aanpast.
- De lijst met spelers (en je toevoegingen) wordt per apparaat in de browser bewaard.
  De vijf startspelers staan in `public/index.html` (`DEFAULT_PLAYERS`).
- Gebruik de refresh-knop met mate; dit zijn verzoeken aan de KNLTB-website.
