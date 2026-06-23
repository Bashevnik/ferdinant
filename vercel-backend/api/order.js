// Vercel serverless function — forwards a shop order to Telegram.
// Secrets come from Vercel env vars (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID),
// never from the repo.
module.exports = async (req, res) => {
    // CORS — allow the static site (GitHub Pages / Vercel) to call this.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    // TELEGRAM_CHAT_ID may hold several recipients, comma-separated
    // (e.g. owner + barber) — the order is delivered to each.
    const chatIds = String(process.env.TELEGRAM_CHAT_ID || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    if (!token || !chatIds.length) {
        return res.status(500).json({ error: 'Telegram credentials not configured' });
    }

    try {
        const results = await Promise.all(chatIds.map((id) =>
            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // No parse_mode on purpose: product names contain "&" / "<" which
                // would break Telegram's HTML parser. Plain text is safe.
                body: JSON.stringify({ chat_id: id, text, disable_web_page_preview: true })
            }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }))
        ));

        // Success if the order reached at least one recipient.
        if (results.some((d) => d && d.ok)) return res.status(200).json({ success: true });

        console.error('Telegram API error:', results);
        return res.status(502).json({ error: 'Failed to send to Telegram' });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
