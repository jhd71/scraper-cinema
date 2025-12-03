const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeCinema() {
    console.log('🎬 Démarrage du scraping du Cinéma Le Capitole...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // User agent pour éviter d'être bloqué
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        console.log('📡 Chargement de la page des horaires...');
        await page.goto('https://www.cinemacapitole-montceau.fr/horaires/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Attendre que les films soient chargés
        await page.waitForSelector('.css-kz9mk9', { timeout: 30000 });
        console.log('✅ Page chargée avec succès');
        
        // Capture d'écran pour debug
        await page.screenshot({ path: 'screenshot.png', fullPage: true });
        console.log('📸 Screenshot sauvegardé');
        
        // Extraire les données des films
        const films = await page.evaluate(() => {
            const filmElements = document.querySelectorAll('.css-1fwauv0');
            const filmsData = [];
            
            filmElements.forEach((filmEl) => {
                try {
                    // TITRE du film
                    const titreEl = filmEl.querySelector('.css-kz9mk9 a');
                    const titre = titreEl ? titreEl.textContent.trim() : 'Non spécifié';
                    
                    // AFFICHE du film
                    const imageEl = filmEl.querySelector('.css-16rc3bn img');
                    const affiche = imageEl ? imageEl.src : '';
                    
                    // LIEN vers la fiche du film
                    const lienEl = filmEl.querySelector('.css-lgj9p7 a');
                    const lien = lienEl ? 'https://www.cinemacapitole-montceau.fr' + lienEl.getAttribute('href') : '';
                    
                    // DURÉE
                    const dureeEl = filmEl.querySelector('.css-uyt4dk span');
                    const duree = dureeEl ? dureeEl.textContent.trim() : '';
                    
                    // GENRE
                    const genreEl = filmEl.querySelector('.css-45pqov + span, .css-fqfb77 div:last-child');
                    let genre = '';
                    const allSpans = filmEl.querySelectorAll('.css-45pqov');
                    allSpans.forEach(span => {
                        if (span.textContent.includes('Genre')) {
                            const nextText = span.nextSibling;
                            if (nextText) {
                                genre = nextText.textContent.trim();
                            }
                        }
                    });
                    
                    // TOUS LES HORAIRES
                    const horaireElements = filmEl.querySelectorAll('.css-caniai time span, .css-148nby5 time span');
                    const horaires = [];
                    horaireElements.forEach(h => {
                        const horaire = h.textContent.trim();
                        if (horaire && !horaires.includes(horaire)) {
                            horaires.push(horaire);
                        }
                    });
                    
                    // Ajouter seulement si on a au moins un horaire
                    if (horaires.length > 0 && titre !== 'Non spécifié') {
                        filmsData.push({
                            titre: titre,
                            affiche: affiche,
                            lien: lien,
                            duree: duree,
                            genre: genre,
                            horaires: horaires
                        });
                    }
                } catch (e) {
                    console.error('Erreur extraction film:', e);
                }
            });
            
            return filmsData;
        });
        
        console.log(`🎬 ${films.length} films trouvés`);
        
        // Afficher les films trouvés
        films.forEach((film, index) => {
            console.log(`  ${index + 1}. ${film.titre} - Horaires: ${film.horaires.join(', ')}`);
        });
        
        // Créer l'objet de données final
        const data = {
            cinema: {
                nom: "Le Capitole",
                ville: "Montceau-les-Mines",
                adresse: "30 Quai Jules Chagot, 71300 Montceau-les-Mines",
                url: "https://www.cinemacapitole-montceau.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateUpdate: new Date().toISOString(),
            films: films
        };
        
        // Créer le dossier data s'il n'existe pas
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        
        // Sauvegarder le JSON
        fs.writeFileSync('data/cinema.json', JSON.stringify(data, null, 2));
        console.log('✅ Données sauvegardées dans data/cinema.json');
        
        // Sauvegarder aussi le HTML pour debug
        const html = await page.content();
        fs.writeFileSync('page.html', html);
        console.log('📄 HTML sauvegardé dans page.html');
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error);
        process.exit(1);
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

scrapeCinema();