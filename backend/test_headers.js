const { fetchHeaders } = require('./services/stagingService');

async function test() {
    const url = "https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit";
    console.log("Testing fetchHeaders...");

    try {
        const headers = await fetchHeaders(url, { states: ['GA'] });
        console.log("Headers (GA):", headers);

        const allHeaders = await fetchHeaders(url, {});
        console.log("Headers (All):", allHeaders);
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

test();
