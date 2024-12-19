import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.goto("https://getintopc.com/", { waitUntil: "networkidle2" });
  await page.waitForSelector("h2.title");

  const parentTitles = await page.$$("h2.title");
  const linksList = await Promise.all(
    parentTitles.map(async (title) => {
      const text = await title.evaluate((node) => node.textContent.trim());
      const link = await title.$("a");
      const href = await link.evaluate((node) => node.getAttribute("href"));
      return { title: text.trim(), link: href };
    })
  );

  console.log(linksList);

  const clickedPageUrls = await Promise.all(
    linksList.map( (link) => {
      const newPage = browser.newPage();
        newPage.goto(link.link, { waitUntil: "networkidle2" });
        newPage.waitForSelector("button.btn");
        newPage.click("button.btn", { delay: 100 });
        newPage.waitForNavigation({ waitUntil: "networkidle2" });
        
      // Ensure to capture the download link
      if (downloadLink) {
        console.log("Captured download link:", downloadLink);
      } else {
        console.log("No download link found for:", link.link);
      }

    newPage.close();
      return downloadLink;
    })
  );

  console.log("All captured download links:", clickedPageUrls.filter(Boolean));

  await browser.close();
})();
