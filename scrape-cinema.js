// scrape-cinema.js
// Scraper pour récupérer les horaires du cinéma Le Capitole (Montceau-les-Mines)
// Utilise Puppeteer pour charger le JavaScript dynamique du site

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CINEMA_URL = 'https://www.cinemacapitole-montceau.fr/horaires/';
const OUTPUT_FILE = path.join(__dirname, 'data', 'cinema.json');

async function scrapeCinema() {
    console.log('🎬 Démarrage du scraping du cinéma Le Capitole...');
    console.log(`📅 Date: ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // User agent réaliste
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log(`🌐 Chargement de ${CINEMA_URL}...`);
        
        // Charger la page et attendre que le contenu soit chargé
        await page.goto(CINEMA_URL, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        
        // Attendre que les films soient chargés (attendre un sélecteur spécifique)
        // On essaie plusieurs sélecteurs possibles
        const selectors = [
            '.movie-card',
            '.film-card', 
            '.seance-card',
            '.showtime-card',
            '[class*="movie"]',
            '[class*="film"]',
            '[class*="seance"]',
            'article',
            '.card'
        ];
        
        let foundSelector = null;
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                foundSelector = selector;
                console.log(`✅ Sélecteur trouvé: ${selector}`);
                break;
            } catch (e) {
                // Continuer avec le prochain sélecteur
            }
        }
        
        // Attendre un peu plus pour s'assurer que tout est chargé
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extraire les données
        const films = await page.evaluate(() => {
            const results = [];
            
            // Essayer différentes structures de page
            // Structure 1: Cartes de films classiques
            const movieCards = document.querySelectorAll('.movie-card, .film-card, .seance-card, [class*="MovieCard"], [class*="FilmCard"]');
            
            if (movieCards.length > 0) {
                movieCards.forEach(card => {
                    const titleEl = card.querySelector('h2, h3, h4, .title, .movie-title, [class*="title"]');
                    const title = titleEl ? titleEl.textContent.trim() : null;
                    
                    if (title && title.length > 2) {
                        // Extraire les horaires
                        const times = [];
                        const timeElements = card.querySelectorAll('.time, .hour, .seance-time, [class*="time"], [class*="hour"]');
                        timeElements.forEach(t => {
                            const timeText = t.textContent.trim();
                            const timeMatch = timeText.match(/(\d{1,2}[h:]\d{2})/);
                            if (timeMatch) {
                                times.push(timeMatch[1].replace(':', 'h'));
                            }
                        });
                        
                        // Extraire la durée
                        const durationEl = card.querySelector('.duration, .runtime, [class*="duration"], [class*="runtime"]');
                        const duration = durationEl ? durationEl.textContent.trim() : 'Non spécifié';
                        
                        // Extraire le genre
                        const genreEl = card.querySelector('.genre, .category, [class*="genre"]');
                        const genre = genreEl ? genreEl.textContent.trim() : 'Film';
                        
                        // Extraire l'image
                        const imgEl = card.querySelector('img');
                        const poster = imgEl ? imgEl.src : null;
                        
                        results.push({
                            title,
                            duration,
                            genre,
                            poster,
                            times: times.length > 0 ? times : ['Voir site']
                        });
                    }
                });
            }
            
            // Structure 2: Liste de films avec sections
            if (results.length === 0) {
                const sections = document.querySelectorAll('section, article, .film, .movie, [data-film], [data-movie]');
                sections.forEach(section => {
                    const titleEl = section.querySelector('h1, h2, h3, h4, .title, [class*="title"]');
                    const title = titleEl ? titleEl.textContent.trim() : null;
                    
                    if (title && title.length > 2 && title.length < 100) {
                        const times = [];
                        // Chercher les horaires dans le texte
                        const text = section.textContent;
                        const timeMatches = text.match(/\b(\d{1,2}[h:]\d{2})\b/g);
                        if (timeMatches) {
                            timeMatches.forEach(t => {
                                const normalized = t.replace(':', 'h');
                                const hours = parseInt(normalized.split('h')[0]);
                                if (hours >= 10 && hours <= 23 && !times.includes(normalized)) {
                                    times.push(normalized);
                                }
                            });
                        }
                        
                        if (times.length > 0) {
                            results.push({
                                title,
                                duration: 'Non spécifié',
                                genre: 'Film',
                                poster: null,
                                times: times.slice(0, 8)
                            });
                        }
                    }
                });
            }
            
            // Structure 3: Recherche générique dans le body
            if (results.length === 0) {
                const bodyText = document.body.innerText;
                const lines = bodyText.split('\n').filter(l => l.trim().length > 0);
                
                let currentFilm = null;
                lines.forEach(line => {
                    const trimmed = line.trim();
                    
                    // Détecter un titre de film (ligne sans horaire, pas trop longue)
                    if (trimmed.length > 3 && trimmed.length < 80 && !trimmed.match(/\d{1,2}[h:]\d{2}/)) {
                        // Vérifier que ce n'est pas un élément de navigation
                        const navWords = ['horaires', 'accueil', 'contact', 'tarifs', 'newsletter', 'menu', 'fermer'];
                        const isNav = navWords.some(w => trimmed.toLowerCase().includes(w));
                        
                        if (!isNav && /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/.test(trimmed)) {
                            if (currentFilm && currentFilm.times.length > 0) {
                                results.push(currentFilm);
                            }
                            currentFilm = {
                                title: trimmed,
                                duration: 'Non spécifié',
                                genre: 'Film',
                                poster: null,
                                times: []
                            };
                        }
                    }
                    
                    // Détecter des horaires
                    if (currentFilm) {
                        const timeMatches = trimmed.match(/\b(\d{1,2}[h:]\d{2})\b/g);
                        if (timeMatches) {
                            timeMatches.forEach(t => {
                                const normalized = t.replace(':', 'h');
                                const hours = parseInt(normalized.split('h')[0]);
                                if (hours >= 10 && hours <= 23 && !currentFilm.times.includes(normalized)) {
                                    currentFilm.times.push(normalized);
                                }
                            });
                        }
                    }
                });
                
                // Ajouter le dernier film
                if (currentFilm && currentFilm.times.length > 0) {
                    results.push(currentFilm);
                }
            }
            
            return results;
        });
        
        console.log(`📽️ ${films.length} films trouvés`);
        
        // Prendre une capture d'écran pour debug
        const screenshotPath = path.join(__dirname, 'data', 'screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Capture d'écran sauvegardée`);
        
        // Sauvegarder le HTML pour debug
        const html = await page.content();
        const htmlPath = path.join(__dirname, 'data', 'page.html');
        fs.writeFileSync(htmlPath, html);
        console.log(`📄 HTML sauvegardé`);
        
        // Créer l'objet de données
        const data = {
            success: films.length > 0,
            source: 'scraper-github',
            cinema: {
                name: 'Le Capitole',
                city: 'Montceau-les-Mines',
                address: '30 Quai Jules Chagot, 71300 Montceau-les-Mines',
                rooms: 4,
                seats: 589
            },
            scraped_at: new Date().toISOString(),
            scraped_at_fr: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
            count: films.length,
            films: films,
            links: {
                official: 'https://www.cinemacapitole-montceau.fr/horaires/',
                allocine: 'https://www.allocine.fr/seance/salle_gen_csalle=G0FNC.html'
            }
        };
        
        // Créer le dossier data s'il n'existe pas
        const dataDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Sauvegarder les données
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ Données sauvegardées dans ${OUTPUT_FILE}`);
        
        // Afficher les films trouvés
        if (films.length > 0) {
            console.log('\n📋 Films trouvés:');
            films.forEach((film, i) => {
                console.log(`  ${i + 1}. ${film.title} - ${film.times.join(', ')}`);
            });
        } else {
            console.log('⚠️ Aucun film trouvé - vérifiez la capture d\'écran et le HTML');
        }
        
        return data;
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error.message);
        
        // Sauvegarder une erreur
        const errorData = {
            success: false,
            source: 'scraper-github',
            error: error.message,
            scraped_at: new Date().toISOString(),
            films: [],
            links: {
                official: 'https://www.cinemacapitole-montceau.fr/horaires/',
                allocine: 'https://www.allocine.fr/seance/salle_gen_csalle=G0FNC.html'
            }
        };
        
        const dataDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(errorData, null, 2), 'utf8');
        
        throw error;
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

// Exécuter
scrapeCinema()
    .then(() => {
        console.log('\n✅ Scraping terminé avec succès!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Échec du scraping:', error.message);
        process.exit(1);
    });
