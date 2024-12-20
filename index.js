import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { executablePath } from 'puppeteer';
import fs from 'fs';

puppeteer.use(StealthPlugin());


async function getDownloadLink(url) {
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions', // Disable extensions
            '--disable-popup-blocking' // Disable popup blocking
        ],
    });



    let downloadUrl = null;
    let final_data = null;
    try {
        const page = await browser.newPage();
        // Go to article page
        await page.goto(url, { waitUntil: 'networkidle2'});

        await page.waitForSelector('div.post-content');

        const data = await page.evaluate(() => {
            const postContent = document.querySelector(".post-content.clear-block");
            const result = {
                overview: "",
                image:"",
                image_supp:"",
                download_url:"",
                details: {
                    standardized: {}, // Standardized keys
                    other_details: {} // Fallback for unrecognized keys
                }
            };
    
            // Key mapping: Customize as per your requirements
            const keyMapping = {
                "software full name": "software_name",
                "setup file name": "file_name",
                "full setup size": "file_size",
                "setup type": "installer_type",
                "compatibility architecture": "architecture",
                "Compatibility Mechanical": "architecture",
                "latest version release added on": "release_date",
                "developers": "developer"
            };
    
            if (postContent) {
                const secondP = postContent.querySelectorAll("p")[1];
                if (secondP) {
                    result.overview = secondP.textContent.trim();
                }

                // get the image href from the third <p> there is <img> inside
                const thirdP = postContent.querySelectorAll("p")[2];
                if (thirdP) {
                    const image = thirdP.querySelector("img");
                    if (image) {
                        result.image = image.src;
                    }
                }

    
                const uls = postContent.querySelectorAll("ul");
                if (uls.length > 1) {
                    const secondUl = uls[1];
                    const lis = secondUl.querySelectorAll("li");
    
                    lis.forEach(li => {
                        const text = li.textContent.trim();
                        const parts = text.split(":");
                        if (parts.length > 1) {
                            const rawKey = parts[0].trim().toLowerCase();
                            const value = parts.slice(1).join(":").trim();
    
                            // Match raw key to standardized key or fallback
                            const standardizedKey = keyMapping[rawKey] || null;
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
        const searchQuery = data.details.standardized.software_name.toLowerCase().split(' ').slice(0, 2).join(' ')+ " programme Icon 16:3";        
        const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`;

        const searchPage = await browser.newPage();

        try {
            // Extract the product name from your data object
            const productName = data.details.standardized.software_name;

            console.log("Product Name:", productName);

            // Navigate to Google Images search page
            console.log("Navigating to Google Images search page...");
            await searchPage.goto(googleSearchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            console.log("Google Images search page loaded.");

            // Wait for the images to load
            console.log("Waiting for images to load...");
            await searchPage.waitForSelector("img", { timeout: 30000 });
            console.log("Images loaded.");

            // Get the first image link that contains the product name in the alt attribute
            console.log("Getting the first relevant image link...");
            const firstImageLink = await searchPage.evaluate((productName) => {
                const images = Array.from(document.querySelectorAll("img"));
                
                // Normalize product name for comparison
                const normalizedProductName = productName.toLowerCase().split(' ')[0];   
                // Find image where alt attribute contains product name
                const relevantImage = images.find(img => {
                    const altText = img.alt ? img.alt.toLowerCase() : "";
                    return altText.includes(normalizedProductName) && img.src;
                });
                
                // If no relevant image, fallback to the first valid HTTP image
                const fallbackImage = images.find(img => img.src);
                
                return relevantImage ? relevantImage.src : (fallbackImage ? fallbackImage.src : null);
            }, productName);
            //
            data.image_supp = firstImageLink;
            searchPage.close();
        } catch (error) {
            console.error("Error fetching program icon:", error);
            await browser.close();
        }
    
        console.log(data);


        // **************************************
        // get the download link block
        // **************************************

        await page.waitForSelector('button.btn');
        await page.click('button.btn');
        //Monitor for new pages (PHP page)
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const newPage = await target.page();
                if (newPage) {
                    // Monitor responses on the PHP page
                    newPage.on('response', async (response) => {
                        const responseUrl = response.url();
                        if (responseUrl.includes('expires')) {
                            console.log('✅ Found final download URL:', responseUrl);
                            downloadUrl = responseUrl;
                            browser.close();
                        }
                    });
                }
            }
        });

        // // Wait until we find a URL with 'expires' or timeout after 60 seconds
        console.log('Waiting for download URL...');
        let attempts = 0;
        while (!downloadUrl && attempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        data.download_url = downloadUrl;
        final_data = data;
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();    
    }

    return final_data;
}

getDownloadLink('https://getintopc.com/softwares/backup-tool/ashampoo-backup-pro-2025-free-download/')
    .then(data => {
        console.log('\nCompleted scraping. Found links:');
        console.log(data);
    })
    .catch(error => {
        console.error('Script failed:', error);
    });

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
// const downloadLinks = [];
// getAllDownloadLinks()
//     .then(links => {
//         console.log('\nCompleted scraping. Found links:');
//         links.forEach(link => {
//         downloadLinks.push({title: link.title, downloadUrl: link.downloadUrl});
//         });
//     })
//     .catch(error => {
//         console.error('Script failed:', error);
//     });