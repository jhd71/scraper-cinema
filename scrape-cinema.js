// scrape-cinema.js - Scraper Cinéma Le Capitole Montceau (robuste)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://www.cinemacapitole-montceau.fr/horaires/';

async function scrapeCinema() {
    console.log('🎬 Démarrage du scraping du Cinéma Le Capitole...');
    
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        console.log(`📡 Chargement de ${URL}`);
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Fermer popup cookies Didomi si présent
        try {
            const didomiButton = await page.$('#didomi-notice-agree-button');
            if (didomiButton) {
                await didomiButton.click();
                console.log('🍪 Popup cookies fermé');
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (e) {
            console.log('Pas de popup cookies');
        }
        
        // Attendre que la page charge les films
        console.log('⏳ Attente du chargement des films...');
        try {
            await page.waitForSelector('a[href*="/films/"]', { timeout: 30000 });
            console.log('✅ Liens films détectés');
        } catch (e) {
            // Screenshot de debug en cas d'échec
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            await page.screenshot({ path: path.join(dataDir, 'debug-capitole.png'), fullPage: true });
            console.log('📸 Screenshot de debug sauvegardé');
            throw new Error('Aucun film trouvé sur la page');
        }
        
        // Pause pour le rendu complet
        await new Promise(r => setTimeout(r, 2000));
        
        // Extraire les données des films
        const films = await page.evaluate(() => {
            const results = [];
            const seenTitles = new Set();
            
            // Trouver tous les liens vers des fiches film
            const filmLinks = document.querySelectorAll('a[href*="/films/"]');
            
            filmLinks.forEach(link => {
                try {
                    const href = link.getAttribute('href') || '';
                    const title = link.getAttribute('title') || link.textContent?.trim() || '';
                    
                    if (!title || title.length < 2 || seenTitles.has(title)) return;
                    if (href === '/films/' || href === '/films') return;
                    
                    // Remonter pour trouver le conteneur du film
                    let container = link;
                    for (let i = 0; i < 10; i++) {
                        if (!container.parentElement) break;
                        container = container.parentElement;
                        if (container.querySelectorAll('time').length > 0) break;
                    }
                    
                    // Horaires
                    const horaires = [];
                    const timeElements = container.querySelectorAll('time span');
                    timeElements.forEach(t => {
                        const h = t.textContent?.trim();
                        if (h && /^\d{1,2}:\d{2}$/.test(h)) {
                            if (!horaires.includes(h)) horaires.push(h);
                        }
                    });
                    
                    if (horaires.length === 0) {
                        const horaireLinks = container.querySelectorAll('a[aria-label]');
                        horaireLinks.forEach(hl => {
                            const label = hl.getAttribute('aria-label');
                            if (label && /^\d{1,2}:\d{2}$/.test(label)) {
                                if (!horaires.includes(label)) horaires.push(label);
                            }
                        });
                    }
                    
                    if (horaires.length === 0) return;
                    
                    // Affiche
                    let affiche = '';
                    const sourceEl = container.querySelector('picture source');
                    const imgEl = container.querySelector('picture img');
                    if (sourceEl && sourceEl.srcset) {
                        const firstUrl = sourceEl.srcset.split(' ')[0];
                        if (firstUrl) affiche = firstUrl;
                    }
                    if (!affiche && imgEl && imgEl.src) affiche = imgEl.src;
                    
                    // Genre
                    let genre = 'Film';
                    const allText = container.textContent || '';
                    const genreMatch = allText.match(/Genre\s*:\s*([^\n]+)/);
                    if (genreMatch) genre = genreMatch[1].trim();
                    
                    // Durée
                    let duree = '';
                    const dureeMatch = allText.match(/(\d+h\s*\d*min?)/);
                    if (dureeMatch) duree = dureeMatch[1];
                    
                    // Lien complet
                    const lien = href.startsWith('http') ? href : 'https://www.cinemacapitole-montceau.fr' + href;
                    
                    seenTitles.add(title);
                    results.push({ titre: title, genre, duree, horaires, affiche, lien });
                } catch (e) {}
            });
            
            return results;
        });
        
        console.log(`🎬 ${films.length} films trouvés`);
        films.forEach(f => console.log(`   - ${f.titre} (${f.genre}) [${f.duree}] : ${f.horaires.join(', ')}`));
        
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
        
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        fs.writeFileSync(path.join(dataDir, 'cinema.json'), JSON.stringify(data, null, 2));
        console.log(`✅ ${films.length} films sauvegardés dans data/cinema.json`);
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error);
        process.exit(1);
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

scrapeCinema();