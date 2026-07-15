// FERDINAND — Telegram admin CRM for the shop.
// Inline menu + copyable template + step-by-step wizard + list/edit/delete.
// Products live in products.json in the repo; photos in new-products-images/.
// Env: TELEGRAM_BOT_TOKEN, GITHUB_TOKEN, GITHUB_REPO, ADMIN_IDS.

const GH = 'https://api.github.com';
const PRODUCTS_PATH = 'products.json';
const IMG_DIR = 'new-products-images';
const EDIT_MARK = 'Оновлення товару #';
const { listOrders, getOrder, deleteOrder } = require('../lib/kv');

// Wizard fields, in order (matches the copy template). code/volume/sub/tile optional.
const FIELDS = [
    { key: 'name', label: 'Назва', req: true, hint: 'Напиши назву товару.' },
    { key: 'code', label: 'Код', req: false, hint: 'Код/бренд (напр. DEPOT / NO. 106). Або «-» щоб пропустити.' },
    { key: 'price', label: 'Ціна', req: true, hint: 'Ціна — лише число, напр. 1200.' },
    { key: 'volume', label: 'Обʼєм', req: false, hint: 'Обʼєм, напр. 250 ml. Або «-».' },
    { key: 'sub', label: 'Опис', req: false, hint: 'Короткий опис. Або «-».' },
    { key: 'tile', label: 'Плитка', req: false, hint: 'Напиши «світла» (фото на білому) або «темна» (на темному).' }
];

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const ghToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'Bashevnik/ferdinant';
    const admins = String(process.env.ADMIN_IDS || '7578353801').split(',').map((s) => s.trim()).filter(Boolean);
    const tg = (method, payload) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then((r) => r.json()).catch(() => ({ ok: false }));

    // ---- GET: one-time setup (webhook + menu + profile) ----
    if (req.method === 'GET') {
        if (req.query && req.query.setup) {
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            const url = `https://${host}/api/bot`;
            const wh = await tg('setWebhook', { url, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
            await tg('setMyCommands', { commands: [
                { command: 'menu', description: '🏠 Головне меню' },
                { command: 'add', description: '➕ Додати товар' },
                { command: 'list', description: '📋 Товари' },
                { command: 'orders', description: '📥 Замовлення' },
                { command: 'help', description: '❓ Довідка' }
            ] });
            await tg('setChatMenuButton', { menu_button: { type: 'commands' } });
            await tg('setMyShortDescription', { short_description: 'Адмін-панель магазину FERDINAND.' });
            await tg('setMyDescription', { description: 'Адмін-панель магазину FERDINAND BARBERSHOP.\nДодавай і керуй товарами прямо звідси — /menu.' });
            return res.status(200).json({ webhook: url, setWebhook: wh });
        }
        return res.status(200).send('ok');
    }
    if (req.method !== 'POST') return res.status(200).send('ok');

    const update = req.body || {};
    const cbq = update.callback_query;
    const msg = update.message || (cbq && cbq.message);
    if (!msg || !msg.chat) return res.status(200).json({ ok: true });
    const chatId = msg.chat.id;
    const fromId = String((cbq ? cbq.from : msg.from || {}).id);

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const send = (text, extra = {}) => tg('sendMessage', { chat_id: chatId, disable_web_page_preview: true, ...extra, text });
    const menuKb = () => ({ inline_keyboard: [
        [{ text: '➕ Додати товар', callback_data: 'add' }],
        [{ text: '📋 Мої товари', callback_data: 'list' }, { text: '📥 Замовлення', callback_data: 'orders' }],
        [{ text: '❓ Довідка', callback_data: 'help' }]
    ] });

    // ---- auth ----
    if (!admins.includes(fromId)) {
        if (cbq) await tg('answerCallbackQuery', { callback_query_id: cbq.id, text: '⛔ Немає доступу' });
        else await send(`⛔ Ця адмін-панель лише для власників.\n\n🆔 Твій Telegram ID: ${fromId}\nНадішли його власнику — і він додасть тобі доступ.`);
        return res.status(200).json({ ok: true });
    }
    if (!ghToken) { await send('⚙️ Немає GITHUB_TOKEN — скажи розробнику.'); return res.status(200).json({ ok: true }); }

    try {
        // ================= CALLBACK BUTTONS =================
        if (cbq) {
            const data = cbq.data || '';
            await tg('answerCallbackQuery', { callback_query_id: cbq.id });
            if (data === 'menu') return done(res, await send(MENU_TXT, { parse_mode: 'HTML', reply_markup: menuKb() }));
            if (data === 'help') return done(res, await send(HELP_TXT, { parse_mode: 'HTML', reply_markup: backKb() }));
            if (data === 'add') return done(res, await send(ADD_TXT, { parse_mode: 'HTML', reply_markup: addKb() }));
            if (data === 'tpl') { await send(TEMPLATE_TXT, { parse_mode: 'HTML' }); return done(res, await send('☝️ Скопіюй, заповни значення і надішли <b>фото товару з цим текстом у підписі</b>.', { parse_mode: 'HTML', reply_markup: backKb() })); }
            if (data === 'wiz') return done(res, await sendWizardStep(send, 0, {}));
            if (data === 'list') return done(res, await sendList(send, ghToken, repo));
            if (data.startsWith('edit:')) return done(res, await sendEditTemplate(send, ghToken, repo, +data.slice(5)));
            if (data.startsWith('delc:')) { const r = await deleteProduct(ghToken, repo, +data.slice(5)); await send(r); return done(res, await sendList(send, ghToken, repo)); }
            if (data.startsWith('del:')) {
                const i = +data.slice(4); const { data: arr } = await getJson(ghToken, repo);
                if (!arr[i]) return done(res, await send('Товару вже немає.'));
                return done(res, await send(`🗑 Видалити «${esc(arr[i].name)}»?`, { reply_markup: { inline_keyboard: [[
                    { text: '✅ Так, видалити', callback_data: `delc:${i}` }, { text: '↩️ Ні', callback_data: 'list' }]] } }));
            }
            if (data === 'orders') return done(res, await sendOrders(send));
            if (data.startsWith('vieworder:')) return done(res, await sendOrderView(send, data.slice(10)));
            if (data.startsWith('delorderc:')) { await deleteOrder(data.slice(10)); await send('🗑 Замовлення видалено.'); return done(res, await sendOrders(send)); }
            if (data.startsWith('delorder:')) {
                const id = data.slice(9); const o = await getOrder(id);
                if (!o) return done(res, await send('Замовлення вже немає.'));
                return done(res, await send(`🗑 Видалити замовлення від ${esc(o.name || '—')}?`, { reply_markup: { inline_keyboard: [[
                    { text: '✅ Так', callback_data: `delorderc:${id}` }, { text: '↩️ Ні', callback_data: 'orders' }]] } }));
            }
            return done(res, await send(MENU_TXT, { parse_mode: 'HTML', reply_markup: menuKb() }));
        }

        const text = (msg.text || msg.caption || '').trim();

        // ================= WIZARD REPLIES =================
        if (msg.reply_to_message && /Новий товар/.test(msg.reply_to_message.text || '')) {
            return done(res, await handleWizardReply(send, token, ghToken, repo, msg));
        }

        // ================= EDIT (prefilled template resent) =================
        const em = text.match(new RegExp(EDIT_MARK + '(\\d+)'));
        if (em) {
            const idx = +em[1] - 1;
            const fields = parseFields(text);
            let image = null;
            if (msg.photo && msg.photo.length) image = await commitPhoto(token, ghToken, repo, msg.photo[msg.photo.length - 1].file_id);
            const r = await updateProduct(ghToken, repo, idx, fields, image);
            return done(res, await send(r, { reply_markup: backKb() }));
        }

        // ================= COMMANDS =================
        if (/^\/(start|menu)/i.test(text)) return done(res, await send(MENU_TXT, { parse_mode: 'HTML', reply_markup: menuKb() }));
        if (/^\/help/i.test(text)) return done(res, await send(HELP_TXT, { parse_mode: 'HTML', reply_markup: backKb() }));
        if (/^\/add/i.test(text)) return done(res, await send(ADD_TXT, { parse_mode: 'HTML', reply_markup: addKb() }));
        if (/^\/list/i.test(text)) return done(res, await sendList(send, ghToken, repo));
        if (/^\/orders/i.test(text)) return done(res, await sendOrders(send));
        const dl = text.match(/^\/delete\s+(\d+)/i);
        if (dl) { const r = await deleteProduct(ghToken, repo, +dl[1] - 1); return done(res, await send(r, { reply_markup: backKb() })); }

        // ================= PASTE MODE (photo + caption fields) =================
        if (msg.photo && msg.photo.length) {
            const f = parseFields(text);
            if (!f.name || !f.price) return done(res, await send('❗ У підписі потрібні хоча б «Назва:» і «Ціна:». Натисни /add для шаблону.'));
            const image = await commitPhoto(token, ghToken, repo, msg.photo[msg.photo.length - 1].file_id);
            const p = buildProduct(f, image);
            await addProduct(ghToken, repo, p);
            return done(res, await send(`✅ Додано: <b>${esc(p.name)}</b> — ${p.price} ₴\nЗʼявиться в магазині за ~1 хв.`, { parse_mode: 'HTML', reply_markup: menuKb() }));
        }

        return done(res, await send(MENU_TXT, { parse_mode: 'HTML', reply_markup: menuKb() }));
    } catch (e) {
        await send('⚠️ Помилка: ' + (e && e.message ? e.message : e));
        return res.status(200).json({ ok: true });
    }
};

const done = (res) => res.status(200).json({ ok: true });

// ---------- UI text ----------
const MENU_TXT = '🐂 <b>FERDINAND — адмін-панель</b>\n\nКеруй товарами магазину прямо звідси. Обери дію:';
const ADD_TXT = '➕ <b>Додати товар</b>\n\nОбери, як зручніше:\n\n📝 <b>Шаблон</b> — скопіюй текст, заповни і надішли з фото.\n🧭 <b>Покроково</b> — я питатиму по одному пункту.';
const HELP_TXT = [
    '❓ <b>Як це працює</b>', '',
    '• <b>Додати товар</b> → «Шаблон» або «Покроково».',
    '• <b>Шаблон</b>: копіюєш текст, заповнюєш і надсилаєш <b>фото з цим текстом у підписі</b>.',
    '• <b>Покроково</b>: відповідаєш на мої питання по черзі, в кінці — фото.',
    '• <b>Мої товари</b>: перегляд, ✏️ редагувати, 🗑 видалити.', '',
    'Плитка: <b>світла</b> — фото на білому тлі, <b>темна</b> — на темному.',
    'Обовʼязкові поля: <b>Назва</b> і <b>Ціна</b>. Товар зʼявляється на сайті за ~1 хв.'
].join('\n');
const TEMPLATE_TXT = '<pre>Назва: \nКод: DEPOT / NO. \nЦіна: \nОбʼєм: \nОпис: \nПлитка: світла</pre>';
const backKb = () => ({ inline_keyboard: [[{ text: '🏠 Меню', callback_data: 'menu' }]] });
const addKb = () => ({ inline_keyboard: [
    [{ text: '📝 Шаблон (скопіювати)', callback_data: 'tpl' }],
    [{ text: '🧭 Покроково', callback_data: 'wiz' }],
    [{ text: '🏠 Меню', callback_data: 'menu' }]
] });

// ---------- wizard ----------
function renderDraft(d) { return FIELDS.map((f) => `${f.label}: ${d[f.key] || '—'}`).join('\n'); }
function parseDraft(text) {
    const d = {};
    for (const f of FIELDS) {
        const m = String(text).match(new RegExp('^' + f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*(.*)$', 'm'));
        if (m) { const v = m[1].trim(); if (v && v !== '—') d[f.key] = v; }
    }
    return d;
}
function sendWizardStep(send, stepIdx, draft) {
    if (stepIdx >= FIELDS.length) {
        return send(`📸 Новий товар · останній крок\n\nНадішли ФОТО товару у відповідь на це повідомлення.\n\nЧернетка:\n${renderDraft(draft)}`,
            { reply_markup: { force_reply: true } });
    }
    const f = FIELDS[stepIdx];
    return send(`🧭 Новий товар · крок ${stepIdx + 1}/${FIELDS.length}\n${f.label}${f.req ? ' (обовʼязково)' : ''}: ${f.hint}\n\nНадішли значення у відповідь на це повідомлення.\n\nЧернетка:\n${renderDraft(draft)}`,
        { reply_markup: { force_reply: true } });
}
async function handleWizardReply(send, token, ghToken, repo, msg) {
    const prev = msg.reply_to_message.text || '';
    const draft = parseDraft(prev);
    // photo (final) step
    if (/останній крок/.test(prev)) {
        if (!(msg.photo && msg.photo.length)) return send('📸 Надішли саме ФОТО у відповідь на повідомлення вище.', { reply_markup: { force_reply: true } });
        const image = await commitPhoto(token, ghToken, repo, msg.photo[msg.photo.length - 1].file_id);
        const p = buildProduct(draft, image);
        await addProduct(ghToken, repo, p);
        return send(`✅ Додано: ${p.name} — ${p.price} ₴\nЗʼявиться в магазині за ~1 хв.`,
            { reply_markup: { inline_keyboard: [[{ text: '📋 Мої товари', callback_data: 'list' }], [{ text: '🏠 Меню', callback_data: 'menu' }]] } });
    }
    const nMatch = prev.match(/крок (\d+)/);
    const n = nMatch ? +nMatch[1] : 1;
    const field = FIELDS[n - 1];
    let val = (msg.text || '').trim();
    if (val === '-' && !field.req) { /* skip */ }
    else if (field.req && (!val || (field.key === 'price' && !val.replace(/\D/g, '')))) {
        return sendWizardStep(send, n - 1, draft); // re-ask same step
    } else { draft[field.key] = field.key === 'price' ? val.replace(/\D/g, '') : val; }
    return sendWizardStep(send, n, draft);
}

// ---------- product building ----------
function parseFields(text) {
    const map = { 'назва': 'name', 'код': 'code', 'ціна': 'price', 'цена': 'price', 'обʼєм': 'volume', "об'єм": 'volume', 'объем': 'volume', 'обсяг': 'volume', 'опис': 'sub', 'описание': 'sub', 'плитка': 'tile', 'склад': 'details' };
    const out = {};
    for (const line of String(text).split('\n')) {
        const m = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
        if (!m) continue;
        const k = map[m[1].trim().toLowerCase()];
        if (k && out[k] === undefined) out[k] = m[2].trim();
    }
    return out;
}
function buildProduct(f, image) {
    return {
        code: f.code && f.code !== '—' ? f.code : 'DEPOT',
        name: f.name, sub: f.sub && f.sub !== '—' ? f.sub : '',
        volume: f.volume && f.volume !== '—' ? f.volume : '',
        price: Number(String(f.price).replace(/\D/g, '')) || 0,
        image, tile: /темн|dark/i.test(f.tile || '') ? 'dark' : 'light',
        details: f.details || ''
    };
}

// ---------- GitHub ----------
function ghApi(ghToken, path, options = {}) {
    return fetch(`${GH}/repos/${path}`, { ...options, headers: {
        'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
        'User-Agent': 'ferdinand-admin-bot', ...(options.headers || {}) } });
}
async function getJson(ghToken, repo) {
    const r = await ghApi(ghToken, `${repo}/contents/${PRODUCTS_PATH}`);
    if (r.status === 404) return { data: [], sha: null };
    if (!r.ok) throw new Error(`GitHub read ${r.status}`);
    const j = await r.json();
    return { data: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8') || '[]'), sha: j.sha };
}
async function putFile(ghToken, repo, path, buf, message, sha) {
    const r = await ghApi(ghToken, `${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({
        message, content: buf.toString('base64'), branch: 'main', ...(sha ? { sha } : {}) }) });
    if (!r.ok) throw new Error(`GitHub write ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r.json();
}
async function commitPhoto(token, ghToken, repo, fileId) {
    const meta = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
    if (!meta.ok) throw new Error('getFile failed');
    const bytes = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`)).arrayBuffer());
    const name = `${IMG_DIR}/bot-${Date.now()}.jpg`;
    await putFile(ghToken, repo, name, bytes, `bot: product image ${name}`);
    return name;
}
async function addProduct(ghToken, repo, product) {
    const { data, sha } = await getJson(ghToken, repo);
    data.push(product);
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: add "${product.name}"`, sha);
}
async function updateProduct(ghToken, repo, index, fields, image) {
    const { data, sha } = await getJson(ghToken, repo);
    if (index < 0 || index >= data.length) return 'Немає товару з таким номером.';
    const p = data[index];
    if (fields.name) p.name = fields.name;
    if (fields.code) p.code = fields.code;
    if (fields.price) p.price = Number(String(fields.price).replace(/\D/g, '')) || p.price;
    if (fields.volume !== undefined) p.volume = fields.volume === '-' ? '' : fields.volume;
    if (fields.sub !== undefined) p.sub = fields.sub === '-' ? '' : fields.sub;
    if (fields.tile) p.tile = /темн|dark/i.test(fields.tile) ? 'dark' : 'light';
    if (image) p.image = image;
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: edit "${p.name}"`, sha);
    return `✅ Оновлено: ${p.name} — ${p.price} ₴`;
}
async function deleteProduct(ghToken, repo, index) {
    const { data, sha } = await getJson(ghToken, repo);
    if (index < 0 || index >= data.length) return 'Немає товару з таким номером.';
    const [rm] = data.splice(index, 1);
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: delete "${rm.name}"`, sha);
    return `🗑 Видалено: ${rm.name}`;
}
async function sendList(send, ghToken, repo) {
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const { data } = await getJson(ghToken, repo);
    if (!data.length) return send('📋 Товарів поки немає. Натисни «Додати товар».', { parse_mode: 'HTML', reply_markup: addKb() });
    const rows = data.map((p, i) => [
        { text: `✏️ ${(p.name || '').slice(0, 20)}`, callback_data: `edit:${i}` },
        { text: '🗑', callback_data: `del:${i}` }
    ]);
    rows.push([{ text: '➕ Додати', callback_data: 'add' }, { text: '🏠 Меню', callback_data: 'menu' }]);
    const list = data.map((p, i) => `${i + 1}. <b>${esc(p.name)}</b> — ${p.price} ₴`).join('\n');
    return send(`📋 <b>Товари магазину</b> (${data.length}):\n\n${list}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
}
async function sendEditTemplate(send, ghToken, repo, index) {
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const { data } = await getJson(ghToken, repo);
    const p = data[index];
    if (!p) return send('Товару вже немає.', { reply_markup: backKb() });
    const tpl = `${EDIT_MARK}${index + 1}\nНазва: ${p.name || ''}\nКод: ${p.code || ''}\nЦіна: ${p.price || ''}\nОбʼєм: ${p.volume || ''}\nОпис: ${p.sub || ''}\nПлитка: ${p.tile === 'dark' ? 'темна' : 'світла'}`;
    await send(`<pre>${esc(tpl)}</pre>`, { parse_mode: 'HTML' });
    return send('☝️ Зміни значення і надішли назад.\n• тільки текст — оновить дані, фото лишиться;\n• текст + нове фото — замінить і фото.\n<b>Перший рядок не видаляй</b> — по ньому я впізнаю товар.', { parse_mode: 'HTML', reply_markup: backKb() });
}

// ---------- orders (private KV store) ----------
async function sendOrders(send) {
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const orders = await listOrders();
    if (orders === null) return send('📥 Сховище замовлень ще не підключено (потрібна приватна база Vercel KV). Скажи розробнику — підключу.', { parse_mode: 'HTML', reply_markup: backKb() });
    if (!orders.length) return send('📥 Замовлень поки немає.', { reply_markup: backKb() });
    const shown = orders.slice(0, 20);
    const rows = shown.map((o) => [
        { text: `👁 ${(o.name || '—').slice(0, 16)} · ${o.total || ''}`.trim(), callback_data: `vieworder:${o.id}` },
        { text: '🗑', callback_data: `delorder:${o.id}` }
    ]);
    rows.push([{ text: '🏠 Меню', callback_data: 'menu' }]);
    const head = shown.map((o, i) => `${i + 1}. ${esc(o.name || '—')} · ${esc(o.phone || '')} · <b>${esc(o.total || '')}</b>`).join('\n');
    return send(`📥 <b>Замовлення</b> (${shown.length} з ${orders.length}):\n\n${head}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
}
async function sendOrderView(send, id) {
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const o = await getOrder(id);
    if (!o) return send('Замовлення вже немає.', { reply_markup: backKb() });
    const date = new Date(o.ts || Date.now()).toLocaleString('uk-UA');
    return send(`📦 <b>Замовлення</b> · ${esc(date)}\n\n${esc(o.text || '')}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[
        { text: '🗑 Видалити', callback_data: `delorder:${id}` }, { text: '↩️ До списку', callback_data: 'orders' }]] } });
}
