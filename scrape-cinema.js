// scrape-cinema.js - Scraper Cinéma Le Capitole Montceau (robuste + fallback jour suivant)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.cinemacapitole-montceau.fr';
const URL = SITE_URL + '/horaires/';

// Fonction d'extraction des films sur la page courante
async function extractFilms(page) {
    return await page.evaluate((siteUrl) => {
        const results = [];
        const seenTitles = new Set();
        
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
                
                // Genre - chercher le petit élément qui contient "Genre :"
                let genre = 'Film';
                const allEls = container.querySelectorAll('div, span, p');
                for (const el of allEls) {
                    const t = el.textContent?.trim() || '';
                    if (t.includes('Genre') && t.includes(':') && t.length < 80) {
                        const g = t.replace(/.*Genre\s*:\s*/, '').trim();
                        if (g && g.length > 1 && g.length < 50) {
                            genre = g;
                            break;
                        }
                    }
                }
                
                // Durée
                let duree = '';
                const allText = container.textContent || '';
                const dureeMatch = allText.match(/(\d+h\s*\d*min?)/);
                if (dureeMatch) duree = dureeMatch[1];
                
                // Lien complet
                const lien = href.startsWith('http') ? href : siteUrl + href;
                
                seenTitles.add(title);
                results.push({ titre: title, genre, duree, horaires, affiche, lien });
            } catch (e) {}
        });
        
        return results;
    }, SITE_URL);
}

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
        
        // Fermer popup cookies Didomi
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
        
        // Attendre le chargement initial
        console.log('⏳ Attente du chargement...');
        await new Promise(r => setTimeout(r, 3000));
        
        // Essayer d'extraire les films du jour
        let films = [];
        let dateLabel = "Aujourd'hui";
        
        try {
            await page.waitForSelector('a[href*="/films/"]', { timeout: 10000 });
            films = await extractFilms(page);
            console.log(`📅 Aujourd'hui : ${films.length} films trouvés`);
        } catch (e) {
            console.log("📅 Aucun film aujourd'hui, recherche du prochain jour...");
        }
        
        // Si pas de films aujourd'hui, cliquer sur les jours suivants
        if (films.length === 0) {
            // Récupérer tous les boutons de dates
            const dateButtons = await page.$$('button, a, div[role="button"]');
            
            // Chercher les boutons de dates (format "sam.21", "dim.22", etc.)
            const dateBtns = await page.evaluate(() => {
                const buttons = [];
                const allElements = document.querySelectorAll('button, a, div[role="button"], [class*="date"], [class*="day"]');
                const jourRegex = /^(lun|mar|mer|jeu|ven|sam|dim)\.?\s*\d{1,2}$/i;
                
                allElements.forEach((el, idx) => {
                    const text = el.textContent?.trim() || '';
                    if (jourRegex.test(text)) {
                        buttons.push({ text, index: idx });
                    }
                });
                return buttons;
            });
            
            console.log(`📅 ${dateBtns.length} boutons de dates trouvés: ${dateBtns.map(b => b.text).join(', ')}`);
            
            // Essayer chaque bouton de date jusqu'à trouver des films
            for (let i = 0; i < Math.min(dateBtns.length, 5); i++) {
                const btn = dateBtns[i];
                console.log(`📅 Essai du ${btn.text}...`);
                
                // Cliquer sur ce bouton de date
                const clicked = await page.evaluate((btnText) => {
                    const jourRegex = /^(lun|mar|mer|jeu|ven|sam|dim)\.?\s*\d{1,2}$/i;
                    const allElements = document.querySelectorAll('button, a, div[role="button"], [class*="date"], [class*="day"]');
                    
                    for (const el of allElements) {
                        if (el.textContent?.trim() === btnText) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }, btn.text);
                
                if (!clicked) continue;
                
                // Attendre le rechargement des films
                await new Promise(r => setTimeout(r, 3000));
                
                try {
                    await page.waitForSelector('a[href*="/films/"]', { timeout: 8000 });
                    films = await extractFilms(page);
                    
                    if (films.length > 0) {
                        // Vérifier si la date trouvée est aujourd'hui (heure Paris)
                        const parisDate = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric' });
                        const btnNum = btn.text.match(/\d+/);
                        if (btnNum && btnNum[0] === parisDate) {
                            dateLabel = "Aujourd'hui";
                        } else {
                            dateLabel = btn.text.charAt(0).toUpperCase() + btn.text.slice(1);
                        }
                        console.log(`✅ ${films.length} films trouvés pour ${dateLabel}`);
                        break;
                    }
                } catch (e) {
                    console.log(`   Pas de films pour ${btn.text}`);
                }
            }
        }
        
        // Si toujours rien, screenshot de debug
        if (films.length === 0) {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            await page.screenshot({ path: path.join(dataDir, 'debug-capitole.png'), fullPage: true });
            console.log('📸 Screenshot de debug sauvegardé');
        }
        
        films.forEach(f => console.log(`   - ${f.titre} (${f.genre}) [${f.duree}] : ${f.horaires.join(', ')}`));
        
        const data = {
            cinema: {
                nom: "Le Capitole",
                ville: "Montceau-les-Mines",
                adresse: "30 Quai Jules Chagot, 71300 Montceau-les-Mines",
                url: "https://www.cinemacapitole-montceau.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateLabel: dateLabel,
            dateUpdate: new Date().toISOString(),
            films: films
        };
        
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        fs.writeFileSync(path.join(dataDir, 'cinema.json'), JSON.stringify(data, null, 2));
        console.log(`✅ ${films.length} films sauvegardés (${dateLabel})`);
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error);
        process.exit(1);
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

scrapeCinema();