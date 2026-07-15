// Telegram admin bot for the Ferdinand shop.
// Owner sends a photo with a captioned template -> product is committed to the
// GitHub repo (photo + products.json) -> the static site shows it in ~1 min.
//
// Env (Vercel): TELEGRAM_BOT_TOKEN, GITHUB_TOKEN, GITHUB_REPO (owner/repo),
//               ADMIN_IDS (comma-separated Telegram user ids allowed to manage).

const TG = (token, method) => `https://api.telegram.org/bot${token}/${method}`;
const GH = 'https://api.github.com';
const PRODUCTS_PATH = 'products.json';
const IMG_DIR = 'new-products-images';

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const ghToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'Bashevnik/ferdinant';
    const admins = String(process.env.ADMIN_IDS || '7578353801').split(',').map((s) => s.trim()).filter(Boolean);

    // --- one-time webhook registration: GET /api/bot?setup=1 ---
    if (req.method === 'GET') {
        if (req.query && req.query.setup) {
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            const url = `https://${host}/api/bot`;
            const r = await fetch(TG(token, 'setWebhook'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, allowed_updates: ['message'], drop_pending_updates: true })
            });
            return res.status(200).json({ webhook: url, telegram: await r.json() });
        }
        return res.status(200).send('ok');
    }
    if (req.method !== 'POST') return res.status(200).send('ok');

    const msg = (req.body || {}).message;
    if (!msg || !msg.chat) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;
    const fromId = msg.from && String(msg.from.id);
    const reply = (text) => fetch(TG(token, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    }).catch(() => {});

    if (!admins.includes(fromId)) {
        await reply('⛔ Ця адмін-панель лише для власника.');
        return res.status(200).json({ ok: true });
    }
    if (!ghToken) {
        await reply('⚙️ Бот ще не під’єднаний до GitHub (немає GITHUB_TOKEN). Скажи розробнику.');
        return res.status(200).json({ ok: true });
    }

    const text = (msg.text || msg.caption || '').trim();

    try {
        if (/^\/start/i.test(text)) { await reply(START_MSG); return res.status(200).json({ ok: true }); }
        if (/^\/help/i.test(text)) { await reply(START_MSG); return res.status(200).json({ ok: true }); }
        if (/^\/add\b/i.test(text) && !(msg.photo && msg.photo.length)) { await reply(TEMPLATE_MSG); return res.status(200).json({ ok: true }); }
        if (/^\/list/i.test(text)) { await reply(await listProducts(ghToken, repo)); return res.status(200).json({ ok: true }); }
        const del = text.match(/^\/delete\s+(\d+)/i);
        if (del) { await reply(await deleteProduct(ghToken, repo, parseInt(del[1], 10) - 1)); return res.status(200).json({ ok: true }); }

        // Adding a product = a photo whose caption holds the fields
        if (msg.photo && msg.photo.length) {
            const f = parseFields(text);
            if (!f.name || !f.price) {
                await reply('❗ Треба хоча б «Назва:» і «Ціна:». Надішли фото з підписом за шаблоном — /add покаже шаблон.');
                return res.status(200).json({ ok: true });
            }
            const fileId = msg.photo[msg.photo.length - 1].file_id; // largest size
            const image = await commitPhoto(token, ghToken, repo, fileId);
            const product = {
                code: f.code || 'DEPOT',
                name: f.name,
                sub: f.sub || '',
                volume: f.volume || '',
                price: Number(String(f.price).replace(/\D/g, '')) || 0,
                image,
                tile: /темн|dark/i.test(f.tile || '') ? 'dark' : 'light',
                details: f.details || ''
            };
            await addProduct(ghToken, repo, product);
            await reply(`✅ Додано: ${product.name} — ${product.price} ₴\nЗʼявиться в магазині за ~1 хв.`);
            return res.status(200).json({ ok: true });
        }

        await reply('Надішли /add — покажу шаблон. Або /list, /delete <номер>.');
        return res.status(200).json({ ok: true });
    } catch (e) {
        await reply('⚠️ Помилка: ' + (e && e.message ? e.message : e));
        return res.status(200).json({ ok: true });
    }
};

const START_MSG = [
    '🛠 FERDINAND — адмін-панель магазину.',
    '',
    'Команди:',
    '• /add — показати шаблон нового товару',
    '• /list — список товарів (додані через бота)',
    '• /delete <номер> — видалити товар зі списку',
    '',
    'Щоб додати товар — надішли ФОТО з підписом за шаблоном (/add).'
].join('\n');

const TEMPLATE_MSG = [
    '📦 Надішли ФОТО товару, а в підписі до фото — ось так:',
    '',
    'Назва: DANDRUFF CONTROL CREAM SHAMPOO',
    'Код: DEPOT / NO. 106',
    'Ціна: 1200',
    'Обʼєм: 125 ml',
    'Опис: Крем-шампунь інтенсивної дії проти лупи.',
    'Плитка: світла',
    'Склад: (необовʼязково) активні інгредієнти…',
    '',
    '⚠️ «Плитка»: світла — для фото на білому тлі, темна — для фото на темному.',
    'Обовʼязкові поля: Назва і Ціна. Решта — за бажанням.'
].join('\n');

function parseFields(text) {
    const map = {
        'назва': 'name', 'код': 'code', 'ціна': 'price', 'цена': 'price',
        'обʼєм': 'volume', "об'єм": 'volume', 'объем': 'volume', 'обсяг': 'volume',
        'опис': 'sub', 'описание': 'sub', 'плитка': 'tile', 'склад': 'details'
    };
    const out = {};
    for (const line of String(text).split('\n')) {
        const m = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
        if (!m) continue;
        const key = map[m[1].trim().toLowerCase()];
        if (key && !out[key]) out[key] = m[2].trim();
    }
    return out;
}

// --- GitHub helpers ---
async function ghApi(ghToken, path, options = {}) {
    const r = await fetch(`${GH}/repos/${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'ferdinand-admin-bot',
            ...(options.headers || {})
        }
    });
    return r;
}

async function getJsonFile(ghToken, repo, path) {
    const r = await ghApi(ghToken, `${repo}/contents/${path}`);
    if (r.status === 404) return { data: [], sha: null };
    if (!r.ok) throw new Error(`GitHub read ${r.status}`);
    const j = await r.json();
    const content = Buffer.from(j.content, 'base64').toString('utf8');
    return { data: JSON.parse(content || '[]'), sha: j.sha };
}

async function putFile(ghToken, repo, path, contentBuffer, message, sha) {
    const r = await ghApi(ghToken, `${repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
            message,
            content: contentBuffer.toString('base64'),
            branch: 'main',
            ...(sha ? { sha } : {})
        })
    });
    if (!r.ok) throw new Error(`GitHub write ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
}

async function commitPhoto(token, ghToken, repo, fileId) {
    const meta = await (await fetch(TG(token, 'getFile') + `?file_id=${fileId}`)).json();
    if (!meta.ok) throw new Error('Telegram getFile failed');
    const filePath = meta.result.file_path;
    const bytes = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)).arrayBuffer());
    const name = `${IMG_DIR}/bot-${Date.now()}.jpg`;
    await putFile(ghToken, repo, name, bytes, `bot: add product image ${name}`);
    return name;
}

async function addProduct(ghToken, repo, product) {
    const { data, sha } = await getJsonFile(ghToken, repo, PRODUCTS_PATH);
    data.push(product);
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: add product "${product.name}"`, sha);
}

async function listProducts(ghToken, repo) {
    const { data } = await getJsonFile(ghToken, repo, PRODUCTS_PATH);
    if (!data.length) return 'Список товарів (доданих ботом) порожній.';
    return 'Товари, додані ботом:\n' + data.map((p, i) => `${i + 1}. ${p.name} — ${p.price} ₴`).join('\n') + '\n\nВидалити: /delete <номер>';
}

async function deleteProduct(ghToken, repo, index) {
    const { data, sha } = await getJsonFile(ghToken, repo, PRODUCTS_PATH);
    if (index < 0 || index >= data.length) return 'Немає товару з таким номером. /list — переглянути.';
    const [removed] = data.splice(index, 1);
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: delete product "${removed.name}"`, sha);
    return `🗑 Видалено: ${removed.name}`;
}
