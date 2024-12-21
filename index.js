import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from 'fs';

puppeteer.use(StealthPlugin());

async function initBrowser() {
    return await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions', '--disable-popup-blocking']
    });
}

// Function to handle JSON file operations
const JsonHandler = {
    filename: `scraping_results_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,

    initialize() {
        // Create empty JSON array
        fs.writeFileSync(this.filename, '[]');
        console.log(`📝 Initialized JSON file: ${this.filename}`);
    },

    appendArticle(article) {
        try {
            // Read current content
            const content = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            // Append new article
            content.push(article);
            // Write back to file
            fs.writeFileSync(this.filename, JSON.stringify(content, null, 2));
            console.log(`💾 Saved article: ${article.title}`);
        } catch (error) {
            console.error('❌ Error saving to JSON:', error.message);
        }
    },

    appendLinks(links, pageNum) {
        try {
            // Read current content
            const content = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
            // Add page number to each link
            const linksWithPage = links.map(link => ({
                ...link,
                pageNum,
                processed: false
            }));
            // Append new links
            content.push(...linksWithPage);
            // Write back to file
            fs.writeFileSync(this.filename, JSON.stringify(content, null, 2));
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
    }
};

async function scrapeArticleData(browser, url) {
    console.log(`📄 Scraping article data from: ${url}`);
    
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('div.post-content');

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
    try {
        const searchQuery = `${softwareName.toLowerCase().split(' ').slice(0, 2).join(' ')} programme Icon 16:3`;
        await searchPage.goto(
            `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`,
            { waitUntil: "domcontentloaded", timeout: 60000 }
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
        await page.waitForSelector('button.btn');
        await page.click('button.btn');

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 60000);
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
            waitUntil: 'networkidle2',
            timeout: 60000
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

        const suppImage = await getSupplementaryImage(
            browser,
            articleData.details.standardized.software_name || article.title
        );
        
        const downloadUrl = await getDownloadLink(page);

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

        // Brief pause between articles
        await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
        console.error(`❌ Error processing article ${article.title}:`, error.message);
    }
    
    // If browser wasn't closed by download process, close it
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
    
    // Initialize JSON file
    JsonHandler.initialize();

    // First phase: Gather all links
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const links = await scrapePageLinks(pageNum);
        JsonHandler.appendLinks(links, pageNum);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Second phase: Process each link
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