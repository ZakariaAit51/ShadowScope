import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from 'fs';

puppeteer.use(StealthPlugin());

async function initBrowser() {
    return await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-popup-blocking',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    });
}

// Function to handle JSON file operations
const JsonHandler = {
    filename: `scraping_results_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    totalArticles: 0,
    processedArticles: 0,

    initialize() {
        fs.writeFileSync(this.filename, '[]');
        console.log(`📝 Initialized JSON file: ${this.filename}`);
    },

    appendArticle(article) {
        try {
            const content = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            content.push(article);
            fs.writeFileSync(this.filename, JSON.stringify(content, null, 2));
            this.processedArticles++;
            this.showProgress();
            console.log(`💾 Saved article: ${article.title}`);
        } catch (error) {
            console.error('❌ Error saving to JSON:', error.message);
        }
    },

    appendLinks(links, pageNum) {
        try {
            const content = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            const linksWithPage = links.map(link => ({
                ...link,
                pageNum,
                processed: false
            }));
            content.push(...linksWithPage);
            fs.writeFileSync(this.filename, JSON.stringify(content, null, 2));
            this.totalArticles += links.length;
            console.log(`💾 Saved ${links.length} links from page ${pageNum}`);
        } catch (error) {
            console.error('❌ Error saving links to JSON:', error.message);
        }
    },

    markAsProcessed(index) {
        try {
            const content = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            if (content[index]) {
                content[index].processed = true;
                fs.writeFileSync(this.filename, JSON.stringify(content, null, 2));
            }
        } catch (error) {
            console.error('❌ Error marking as processed:', error.message);
        }
    },

    getUnprocessedLinks() {
        try {
            const content = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            return content.filter(item => !item.processed);
        } catch (error) {
            console.error('❌ Error reading unprocessed links:', error.message);
            return [];
        }
    },

    showProgress() {
        const percentage = ((this.processedArticles / this.totalArticles) * 100).toFixed(2);
        const progressBar = '='.repeat(Math.floor(percentage / 2)) + '-'.repeat(50 - Math.floor(percentage / 2));
        console.log(`\nProgress: [${progressBar}] ${this.processedArticles}/${this.totalArticles} (${percentage}%)\n`);
    }
};

async function scrapeArticleData(browser, url) {
    console.log(`📄 Scraping article data from: ${url}`);
    
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            request.abort();
        } else {
            request.continue();
        }
    });

    try {
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        const contentPromise = page.waitForSelector('div.post-content');
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Selector timeout')), 10000)
        );
        
        await Promise.race([contentPromise, timeoutPromise]);

        const data = await page.evaluate(() => {
            const postContent = document.querySelector(".post-content.clear-block");
            const result = {
                overview: "",
                image: "",
                details: {
                    standardized: {},
                    other_details: {}
                }
            };

            const keyMapping = {
                "software full name": "software_name",
                "setup file name": "file_name",
                "full setup size": "file_size",
                "setup type": "installer_type",
                "compatibility architecture": "architecture",
                "compatibility mechanical": "architecture",
                "latest version release added on": "release_date",
                "developers": "developer"
            };

            if (postContent) {
                const secondP = postContent.querySelectorAll("p")[1];
                result.overview = secondP ? secondP.textContent.trim() : "";

                const thirdP = postContent.querySelectorAll("p")[2];
                const image = thirdP?.querySelector("img");
                result.image = image ? image.src : "";

                const uls = postContent.querySelectorAll("ul");
                if (uls.length > 1) {
                    const detailsList = uls[1].querySelectorAll("li");
                    detailsList.forEach(li => {
                        const [key, ...valueParts] = li.textContent.trim().split(":");
                        if (valueParts.length) {
                            const rawKey = key.trim().toLowerCase();
                            const value = valueParts.join(":").trim();
                            
                            const standardizedKey = keyMapping[rawKey];
                            if (standardizedKey) {
                                result.details.standardized[standardizedKey] = value;
                            } else {
                                result.details.other_details[rawKey.replaceAll(' ', '_')] = value;
                            }
                        }
                    });
                }
            }
            return result;
        });

        return { page, data };
    } catch (error) {
        console.error(`❌ Error scraping article data: ${error.message}`);
        await page.close();
        return { page: null, data: null };
    }
}

async function getSupplementaryImage(browser, softwareName) {
    console.log(`🔍 Searching for supplementary image for: ${softwareName}`);
    
    const searchPage = await browser.newPage();
    await searchPage.setRequestInterception(true);
    
    searchPage.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['stylesheet', 'font', 'media'].includes(resourceType)) {
            request.abort();
        } else {
            request.continue();
        }
    });

    try {
        const searchQuery = `${softwareName.toLowerCase().split(' ').slice(0, 2).join(' ')} programme Icon 16:3`;
        await searchPage.goto(
            `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`,
            { waitUntil: "domcontentloaded", timeout: 30000 }
        );

        await searchPage.waitForSelector("img");
        
        const imageUrl = await searchPage.evaluate((name) => {
            const normalizedName = name.toLowerCase().split(' ')[0];
            const images = Array.from(document.querySelectorAll("img"));
            
            const relevantImage = images.find(img => {
                const altText = img.alt?.toLowerCase() || "";
                return altText.includes(normalizedName) && img.src;
            });
            
            return relevantImage?.src || images[0]?.src || null;
        }, softwareName);

        return imageUrl;
    } catch (error) {
        console.error(`❌ Error getting supplementary image: ${error.message}`);
        return null;
    } finally {
        await searchPage.close();
    }
}

async function getDownloadLink(page) {
    console.log('🔗 Getting download link...');
    
    try {
        const buttonPromise = page.waitForSelector('button.btn');
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Button timeout')), 15000)
        );
        
        await Promise.race([buttonPromise, timeoutPromise]);
        await page.click('button.btn');

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 30000);
            let downloadUrl = null;

            page.browser().on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    const newPage = await target.page();
                    if (newPage) {
                        newPage.on('response', async (response) => {
                            const url = response.url();
                            if (url.includes('expires') && !downloadUrl) {
                                downloadUrl = url;
                                console.log('✅ Download link found, closing browser...');
                                clearTimeout(timeout);
                                
                                try {
                                    const browser = page.browser();
                                    await browser.close();
                                    console.log('✅ Browser closed successfully');
                                } catch (err) {
                                    console.error('⚠️ Error closing browser:', err.message);
                                }
                                
                                resolve(downloadUrl);
                            }
                        });
                    }
                }
            });
        });
    } catch (error) {
        console.error(`❌ Error getting download link: ${error.message}`);
        return null;
    }
}

async function scrapePageLinks(pageNum) {
    console.log(`📑 Scraping links from page ${pageNum}...`);
    
    const browser = await initBrowser();
    const page = await browser.newPage();
    
    try {
        await page.goto(`https://getintopc.com/page/${pageNum}/?0`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForSelector('h2.title');

        const links = await page.evaluate(() => {
            const articleNodes = document.querySelectorAll('.post');
            return Array.from(articleNodes).map(article => {
                const titleLink = article.querySelector('h2.title a');
                const categoryLinks = Array.from(article.querySelectorAll('.post-info a'));
                
                return {
                    title: titleLink?.textContent.trim(),
                    url: titleLink?.href,
                    categories: categoryLinks.map(a => a.textContent.trim())
                };
            });
        });

        return links.filter(link => link.title && link.url);
    } catch (error) {
        console.error(`❌ Error scraping page ${pageNum}:`, error.message);
        return [];
    } finally {
        await browser.close();
    }
}

async function processArticle(article, index) {
    console.log(`\n🔄 Processing article: ${article.title}`);
    
    const browser = await initBrowser();
    try {
        const { page, data: articleData } = await scrapeArticleData(browser, article.url);
        if (!articleData || !page) return;

        const [suppImage, downloadUrl] = await Promise.all([
            getSupplementaryImage(
                browser,
                articleData.details.standardized.software_name || article.title
            ),
            getDownloadLink(page)
        ]);

        const processedArticle = {
            ...article,
            data: {
                ...articleData,
                image_supp: suppImage,
                download_url: downloadUrl
            }
        };

        JsonHandler.appendArticle(processedArticle);
        JsonHandler.markAsProcessed(index);

        console.log(`✅ Successfully processed: ${article.title}`);

        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        console.error(`❌ Error processing article ${article.title}:`, error.message);
    }
    
    try {
        const pages = await browser.pages();
        if (pages.length > 0) {
            await browser.close();
        }
    } catch (error) {
        // Browser was already closed, ignore error
    }
}

async function scrapeWebsite(numPages = 1) {
    console.log(`🚀 Starting scraper - processing ${numPages} pages...`);
    
    JsonHandler.initialize();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const links = await scrapePageLinks(pageNum);
        JsonHandler.appendLinks(links, pageNum);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const unprocessedLinks = JsonHandler.getUnprocessedLinks();
    console.log(`📊 Total articles to process: ${unprocessedLinks.length}`);

    for (let i = 0; i < unprocessedLinks.length; i++) {
        await processArticle(unprocessedLinks[i], i);
    }

    console.log('\n👋 Scraping completed!');
}

// Execute the scraper
scrapeWebsite(1)
    .catch(error => console.error('🚫 Script failed:', error));