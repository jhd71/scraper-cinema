const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://www.cinemacapitole-montceau.fr/horaires/';

async function scrapeCinema() {
    console.log('🎬 Démarrage du scraping du Cinéma Le Capitole...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    try {
        console.log(`📡 Chargement de ${URL}`);
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Fermer popup cookies Didomi si présent
        try {
            const didomiButton = await page.$('#didomi-notice-agree-button');
            if (didomiButton) {
                await didomiButton.click();
                console.log('🍪 Popup cookies fermé');
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            console.log('Pas de popup cookies');
        }
        
        // Attendre les films
        await page.waitForSelector('.css-1fwauv0', { timeout: 30000 });
        console.log('✅ Films trouvés avec .css-1fwauv0');
        
        // Extraire les données des films
        const films = await page.evaluate(() => {
            const filmElements = document.querySelectorAll('.css-1fwauv0');
            const results = [];
            
            filmElements.forEach((filmEl) => {
                try {
                    // Titre et lien depuis le lien principal
                    const linkEl = filmEl.querySelector('a[title]');
                    const titre = linkEl ? linkEl.getAttribute('title') : '';
                    const href = linkEl ? linkEl.getAttribute('href') : '';
                    const lien = href ? 'https://www.cinemacapitole-montceau.fr' + href : '';
                    
                    if (!titre) return;
                    
                    // Affiche
                    let affiche = '';
                    const sourceEl = filmEl.querySelector('picture source');
                    const imgEl = filmEl.querySelector('picture img');
                    
                    if (sourceEl && sourceEl.srcset) {
                        const srcset = sourceEl.srcset;
                        const match = srcset.match(/https:\/\/[^\s]+_500_x[^\s]+\.jpg/);
                        if (match) {
                            affiche = match[0];
                        } else {
                            const firstUrl = srcset.split(' ')[0];
                            if (firstUrl) affiche = firstUrl;
                        }
                    }
                    if (!affiche && imgEl && imgEl.src) {
                        affiche = imgEl.src;
                    }
                    
                    // Genre
                    let genre = 'Film';
                    const allDivs = filmEl.querySelectorAll('.css-fqfb77 > div > div');
                    allDivs.forEach(div => {
                        const text = div.textContent || '';
                        if (text.includes('Genre :')) {
                            genre = text.replace('Genre :', '').trim();
                        }
                    });
                    
                    if (genre === 'Film') {
                        const spans = filmEl.querySelectorAll('span.css-45pqov');
                        spans.forEach(span => {
                            if (span.textContent && span.textContent.includes('Genre')) {
                                const parent = span.parentElement;
                                if (parent) {
                                    const fullText = parent.textContent || '';
                                    genre = fullText.replace('Genre :', '').trim();
                                }
                            }
                        });
                    }
                    
                    // Durée
                    let duree = '';
                    const dureeSpans = filmEl.querySelectorAll('.css-uyt4dk span');
                    dureeSpans.forEach(span => {
                        const text = span.textContent?.trim() || '';
                        if (/^\d+h\s*\d*min?$/.test(text)) {
                            duree = text;
                        }
                    });
                    
                    // Horaires
                    const horaires = [];
                    const timeElements = filmEl.querySelectorAll('time span');
                    timeElements.forEach(time => {
                        const h = time.textContent?.trim();
                        if (h && /^\d{1,2}:\d{2}$/.test(h)) {
                            horaires.push(h);
                        }
                    });
                    
                    if (horaires.length === 0) {
                        const horaireLinks = filmEl.querySelectorAll('a[aria-label]');
                        horaireLinks.forEach(link => {
                            const label = link.getAttribute('aria-label');
                            if (label && /^\d{1,2}:\d{2}$/.test(label)) {
                                horaires.push(label);
                            }
                        });
                    }
                    
                    if (horaires.length > 0) {
                        results.push({
                            titre,
                            genre,
                            duree,
                            horaires,
                            affiche,
                            lien
                        });
                    }
                } catch (e) {
                    console.log('Erreur extraction film:', e.message);
                }
            });
            
            return results;
        });
        
        console.log(`🎬 ${films.length} films trouvés`);
        films.forEach(f => console.log(`   - ${f.titre} (${f.genre}) [${f.duree}] : ${f.horaires.join(', ')}`));
        
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
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Sauvegarder le JSON
        fs.writeFileSync(
            path.join(dataDir, 'cinema.json'),
            JSON.stringify(data, null, 2)
        );
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
