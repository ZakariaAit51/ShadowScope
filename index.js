import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from 'fs';

puppeteer.use(StealthPlugin());

// Improved JsonHandler with batch processing
const JsonHandler = {
    linksFile: `links_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    dataFilePrefix: 'data_batch_',
    batchSize: 100,
    totalArticles: 0,
    processedArticles: 0,
    currentBatch: 0,

    initialize() {
        fs.writeFileSync(this.linksFile, '[]');
        this._createNewBatch();
        console.log(`📝 Initialized files system`);
    },

    _createNewBatch() {
        this.currentBatch = Math.floor(this.processedArticles / this.batchSize);
        const filename = `${this.dataFilePrefix}${this.currentBatch}.json`;
        if (!fs.existsSync(filename)) {
            fs.writeFileSync(filename, '[]');
            console.log(`📝 Created new batch file: ${filename}`);
        }
    },

    _getCurrentBatchFile() {
        return `${this.dataFilePrefix}${this.currentBatch}.json`;
    },

    appendArticle(article) {
        try {
            const batchFile = this._getCurrentBatchFile();
            const content = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
            content.push(article);
            fs.writeFileSync(batchFile, JSON.stringify(content, null, 2));
            
            this.processedArticles++;
            
            if (this.processedArticles % this.batchSize === 0) {
                this._createNewBatch();
            }
            
            this.showProgress();
            console.log(`💾 Saved article: ${article.title} to ${batchFile}`);
        } catch (error) {
            console.error('❌ Error saving to JSON:', error.message);
        }
    },

    appendLinks(links, pageNum) {
        try {
            const content = JSON.parse(fs.readFileSync(this.linksFile, 'utf8'));
            const linksWithPage = links.map(link => ({
                ...link,
                pageNum,
                processed: false
            }));
            content.push(...linksWithPage);
            fs.writeFileSync(this.linksFile, JSON.stringify(content, null, 2));
            this.totalArticles += links.length;
            console.log(`💾 Saved ${links.length} links from page ${pageNum}`);
        } catch (error) {
            console.error('❌ Error saving links to JSON:', error.message);
        }
    },

    markAsProcessed(url) {
        try {
            const content = JSON.parse(fs.readFileSync(this.linksFile, 'utf8'));
            const linkIndex = content.findIndex(item => item.url === url);
            if (linkIndex !== -1) {
                content[linkIndex].processed = true;
                fs.writeFileSync(this.linksFile, JSON.stringify(content, null, 2));
            }
        } catch (error) {
            console.error('❌ Error marking as processed:', error.message);
        }
    },

    getUnprocessedLinks() {
        try {
            const content = JSON.parse(fs.readFileSync(this.linksFile, 'utf8'));
            return content.filter(item => !item.processed);
        } catch (error) {
            console.error('❌ Error reading unprocessed links:', error.message);
            return [];
        }
    },

    showProgress() {
        const percentage = ((this.processedArticles / this.totalArticles) * 100).toFixed(2);
        const progressBar = '='.repeat(Math.floor(percentage / 2)) + '-'.repeat(50 - Math.floor(percentage / 2));
        console.log(`\nProgress: [${progressBar}] ${this.processedArticles}/${this.totalArticles} (${percentage}%)`);
        console.log(`Current batch: ${this.currentBatch}, File: ${this._getCurrentBatchFile()}\n`);
    }
};

// Browser management functions
function logMemoryUsage() {
    const used = process.memoryUsage();
    console.log('Memory usage:');
    for (let key in used) {
        console.log(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
}

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
            '--disable-gpu',
            '--memory-pressure-off',
            '--js-flags="--max-old-space-size=2048"', // Reduced for t3.micro
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });
}

async function scrapeArticleData(browser, url) {
    console.log(`📄 Scraping article data from: ${url}`);
    let page = null;
    
    try {
        page = await browser.newPage();
        await page.setDefaultNavigationTimeout(45000);
        
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'media', 'script'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCache');
        
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });
        
        const contentPromise = page.waitForSelector('div.post-content');
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Selector timeout')), 15000)
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
        if (page) await page.close();
        return { page: null, data: null };
    }
}

async function getSupplementaryImage(browser, softwareName) {
    console.log(`🔍 Searching for supplementary image for: ${softwareName}`);
    
    const searchPage = await browser.newPage();
    await searchPage.setRequestInterception(true);
    
    searchPage.on('request', (request) => {
        if (['stylesheet', 'font', 'media'].includes(request.resourceType())) {
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
                                console.log('✅ Download link found');
                                clearTimeout(timeout);
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

async function scrapePageLinks(pageNum, browser) {
    console.log(`📑 Scraping links from page ${pageNum}...`);
    
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
        await page.close();
    }
}

async function processArticle(article) {
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
        JsonHandler.markAsProcessed(article.url);

        console.log(`✅ Successfully processed: ${article.title}`);

        await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
        console.error(`❌ Error processing article ${article.title}:`, error.message);
    } finally {
        try {
            await browser.close();
        } catch (error) {
            // Browser might already be closed
        }
    }
}

async function scrapeWebsite(numPages = 1) {
    console.log(`🚀 Starting scraper - processing ${numPages} pages...`);
    
    JsonHandler.initialize();
    let browser = null;
    let pageCount = 0;
    const RESTART_BROWSER_AFTER = 10; // Reduced for t3.micro
    
    try {
        // First phase: Collect all links
        console.log('Phase 1: Collecting links...');
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            if (pageCount >= RESTART_BROWSER_AFTER || !browser) {
                if (browser) {
                    await browser.close();
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                browser = await initBrowser();
                pageCount = 0;
                logMemoryUsage();
            }
            
            const links = await scrapePageLinks(pageNum, browser);
            JsonHandler.appendLinks(links, pageNum);
            
            pageCount++;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (browser) await browser.close();
        
        // Second phase: Process articles
        console.log('\nPhase 2: Processing articles...');
        const unprocessedLinks = JsonHandler.getUnprocessedLinks();
        console.log(`Found ${unprocessedLinks.length} articles to process`);

        // Process articles in smaller batches
        const BATCH_SIZE = 5; // Process 5 articles at a time
        for (let i = 0; i < unprocessedLinks.length; i += BATCH_SIZE) {
            const batch = unprocessedLinks.slice(i, i + BATCH_SIZE);
            for (const article of batch) {
                await processArticle(article);
            }
            logMemoryUsage();
            await new Promise(resolve => setTimeout(resolve, 5000)); // Cool-down between batches
        }

        } catch (error) {
        console.error('🚫 Script failed:', error);
        } finally {
        if (browser) {
            await browser.close();
        }
        }

        console.log('\n👋 Scraping completed!');
        }

        // Error recovery
        process.on('unhandledRejection', (error) => {
        console.error('Unhandled rejection:', error);
        });

        // Execute the scraper with automatic retries
        async function executeWithRetries(maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await scrapeWebsite(5);
            break;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            if (attempt < maxRetries) {
                console.log(`Retrying in 30 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }
}

executeWithRetries();