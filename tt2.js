import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { executablePath } from 'puppeteer';
import fs from 'fs';

puppeteer.use(StealthPlugin());

async function scrapeAndDownload() {
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
        defaultViewport: null,
        executablePath: executablePath(),
    });

    try {
        const page = await browser.newPage();
        let downloadUrl = null;

        // Set up request interception for the main page
        await page.setRequestInterception(true);
        page.on('request', async (request) => {
            const url = request.url();
            if (/\.(zip|exe|rar|msi)$/i.test(url)) {
                console.log('🔍 Download URL detected:', url);
                downloadUrl = url;
            }
            await request.continue();
        });

        // Monitor for new pages (including PHP wait page)
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const newPage = await target.page();
                if (newPage) {
                    console.log('🆕 New page opened:', await newPage.url());
                    
                    // Set up interception for the new page
                    await newPage.setRequestInterception(true);
                    
                    // Monitor requests on the new page
                    newPage.on('request', async (request) => {
                        const url = request.url();
                        if (/\.(zip|exe|rar|msi)$/i.test(url) || 
                            url.includes('download') || 
                            url.includes('file')) {
                            console.log('🔗 Download link found in new page:', url);
                            downloadUrl = url;
                        }
                        await request.continue();
                    });

                    // Monitor responses on the new page
                    newPage.on('response', async (response) => {
                        const url = response.url();
                        const headers = response.headers();
                        
                        if (headers['content-type']?.includes('application/') ||
                            headers['content-disposition']?.includes('attachment')) {
                            console.log('📥 Download response detected:', url);
                            downloadUrl = url;
                        }
                    });
                }
            }
        });

        // Navigate to main page
        console.log('📱 Navigating to main page...');
        await page.goto('https://getintopc.com', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Get titles and links
        console.log('🔍 Collecting links...');
        await page.waitForSelector('h2.title');
        const titles = await page.$$('h2.title');

        const linksList = await Promise.all(
            titles.map(async (title) => {
                const text = await title.evaluate(node => node.textContent.trim());
                const linkElement = await title.$('a');
                const href = await linkElement.evaluate(node => node.getAttribute('href'));
                return { title: text, link: href };
            })
        );

        const targetLink = linksList[0]?.link;
        if (targetLink) {
            console.log('🔄 Processing link:', targetLink);
            
            // Navigate to the target page
            await page.goto(targetLink, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Wait for and click the download button
            try {
                await page.waitForSelector('button.btn', { timeout: 30000 });
                const downloadButton = await page.$('button.btn');
                
                console.log('👆 Clicking download button...');
                await downloadButton.click();

                // Wait for the PHP page to open
                console.log('⏳ Waiting for PHP page...');
                // Wait longer for the new page to properly load and process
                await page.waitForTimeout(60000); // Wait 60 seconds for download to start

                if (downloadUrl) {
                    console.log('✅ Successfully captured download URL:', downloadUrl);
                    // Save the download URL to a file
                    fs.writeFileSync('download_url.txt', downloadUrl);
                    console.log('💾 Saved download URL to download_url.txt');
                } else {
                    console.log('❌ No download URL was captured');
                }

            } catch (error) {
                console.error('❌ Error during download process:', error);
            }
        }

    } catch (error) {
        console.error('❌ Error during scraping:', error);
        throw error;
    } finally {
        // Don't close the browser immediately to allow seeing the result
        console.log('⚠️ Script completed. Browser will remain open for verification.');
        // Uncomment the following line if you want to close the browser automatically
        // await browser.close();
    }
}

// Run the scraper
scrapeAndDownload()
    .then(() => {
        console.log('✅ Script completed successfully');
    })
    .catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });