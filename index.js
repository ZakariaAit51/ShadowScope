import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { executablePath } from 'puppeteer';
import fs from 'fs';

puppeteer.use(StealthPlugin());

// async function getDownloadLink(url) {
// const browser = await puppeteer.launch({
//     headless: false,
//     args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-extensions', // Disable extensions
//         '--disable-popup-blocking' // Disable popup blocking
//     ],
// });



//     let downloadUrl = null;

//     try {
//         const page = await browser.newPage();
//         // Go to article page
//         await page.goto(url, { waitUntil: 'networkidle2'});

//         // Click download button
//         await page.waitForSelector('button.btn');
//         await page.click('button.btn');

//         // Monitor for new pages (PHP page)
//         browser.on('targetcreated', async (target) => {
//             if (target.type() === 'page') {
//                 const newPage = await target.page();
//                 if (newPage) {
//                     // Monitor responses on the PHP page
//                     newPage.on('response', async (response) => {
//                         const responseUrl = response.url();
//                         if (responseUrl.includes('expires')) {
//                             console.log('✅ Found final download URL:', responseUrl);
//                             downloadUrl = responseUrl;
//                             browser.close();
//                         }
//                     });
//                 }
//             }
//         });

//         // Wait until we find a URL with 'expires' or timeout after 60 seconds
//         console.log('Waiting for download URL...');
//         let attempts = 0;
//         while (!downloadUrl && attempts < 60) {
//             await new Promise(resolve => setTimeout(resolve, 1000));
//             attempts++;
//         }

//     } catch (error) {
//         console.error('Error:', error);
//     } finally {
//     await browser.close();    
//     }

//     return downloadUrl;
// }

// async function getAllDownloadLinks() {
// const browser = await puppeteer.launch({
//     headless: false,
//     args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-extensions', // Disable extensions
//         '--disable-popup-blocking' // Disable popup blocking
//     ],
//     defaultViewport: null,
//     executablePath: executablePath(),
// });

//     const downloadLinks = [];

//     try {
//         const page = await browser.newPage();
//         const allLinks = [];
//         // Go to main page
//         for (let index = 0; index < 50; index++) {
//             try {
//                 await page.goto(`https://getintopc.com/page/${index}/?0`, { 
//                     waitUntil: 'networkidle2', 
//                     timeout: 60000 
//                 });

//                 // Get all article links
//                 await page.waitForSelector('h2.title');
//                 const links = await page.$$eval('h2.title a', 
//                     elements => elements.map(el => ({
//                         title: el.textContent.trim(),
//                         url: el.href
//                     }))
//                 );
//                 allLinks.push(...links); // Use spread operator to flatten the array
//             } catch (error) {
//                 console.error(`Error on page ${index}:`, error);
//             }
//         }
//         console.log(allLinks)

//         // console.log(`Found ${links.length} articles to process`);
        
//         // Process first 5 links
//         // const linksToProcess = links.slice(0, 5);

//         // // Process each link
//         // for (const link of linksToProcess) {
//         //     console.log(`\nProcessing: ${link.title}`);
//         //     const downloadUrl = await getDownloadLink(link.url);
            
//         //     if (downloadUrl) {
//         //         downloadLinks.push({
//         //             title: link.title,
//         //             downloadUrl: downloadUrl
//         //         });
//         //         console.log(`✅ Successfully got download URL for: ${link.title}`);
//         //     } else {
//         //         console.log(`❌ Failed to get download URL for: ${link.title}`);
//         //     }

//         //     // Wait between articles
//         //     await new Promise(resolve => setTimeout(resolve, 5000));
//         // }

//         // Save to file
//         fs.writeFileSync('download_links.json', JSON.stringify(allLinks, null, 2));
//         console.log('\nSaved all download links to download_links.json');

//     } catch (error) {
//         console.error('Error during scraping:', error);
//     } finally {
//         await browser.close();
//     }

//     return downloadLinks;
// }

// Run the scraper
const downloadLinks = [];
getAllDownloadLinks()
    .then(links => {
        console.log('\nCompleted scraping. Found links:');
        links.forEach(link => {
        downloadLinks.push({title: link.title, downloadUrl: link.downloadUrl});
        });
    })
    .catch(error => {
        console.error('Script failed:', error);
    });