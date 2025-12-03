# 🎬 Scraper Cinéma Le Capitole

Ce projet utilise **Puppeteer** pour scraper automatiquement les horaires du cinéma **Le Capitole** à Montceau-les-Mines.

## 📁 Structure

```
scraper-cinema/
├── scrape-cinema.js          # Script de scraping
├── package.json              # Dépendances
├── .github/
│   └── workflows/
│       └── scrape-cinema.yml # GitHub Actions
└── data/
    ├── cinema.json           # Données des films (généré)
    ├── screenshot.png        # Capture d'écran (debug)
    └── page.html             # HTML de la page (debug)
```

## 🔄 Fonctionnement

Le script `scrape-cinema.js` :
1. Lance un navigateur Puppeteer (Chrome headless)
2. Charge la page des horaires du Capitole
3. Attend que le JavaScript charge les films
4. Extrait les titres, horaires, durées et genres
5. Sauvegarde le tout dans `data/cinema.json`

## ⏰ Exécution automatique

Le workflow GitHub Actions s'exécute :
- 🕒 **Toutes les 3 heures** (cron)
- Ou **manuellement** depuis l'onglet Actions

## 📦 Données générées

Le fichier `data/cinema.json` contient :

```json
{
  "success": true,
  "source": "scraper-github",
  "cinema": {
    "name": "Le Capitole",
    "city": "Montceau-les-Mines",
    "address": "30 Quai Jules Chagot, 71300 Montceau-les-Mines",
    "rooms": 4,
    "seats": 589
  },
  "scraped_at": "2025-12-03T08:00:00.000Z",
  "count": 5,
  "films": [
    {
      "title": "Vaiana 2",
      "duration": "1h40",
      "genre": "Animation",
      "times": ["14h00", "16h30", "20h30"]
    }
  ]
}
```

## 🔗 Utilisation avec actuetmedia.fr

Le widget cinéma d'actuetmedia.fr peut récupérer ce fichier JSON via :

```
https://raw.githubusercontent.com/jhd71/scraper-cinema/main/data/cinema.json
```

## 🛠️ Installation locale

```bash
npm install
npm run scrape
```

## 📬 Contact

[contact@actuetmedia.fr](mailto:contact@actuetmedia.fr)
