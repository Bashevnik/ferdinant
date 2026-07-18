// FERDINAND — Telegram admin CRM for the shop.
// Premium button-first UX: screens are edited in place (like a mini-app),
// products browse as photo cards, minimal free text (only where unavoidable).
// Products live in products.json in the repo; photos in new-products-images/.
// Env: TELEGRAM_BOT_TOKEN, GITHUB_TOKEN, GITHUB_REPO, ADMIN_IDS.

const GH = 'https://api.github.com';
const PRODUCTS_PATH = 'products.json';
const IMG_DIR = 'new-products-images';
const { listOrders, getOrder, deleteOrder } = require('../lib/kv');

// Wizard fields, in order. code/volume/sub optional (skip button); tile is buttons-only.
const FIELDS = [
    { key: 'name', label: 'Назва', req: true, prompt: '✍️ Назва товару' },
    { key: 'code', label: 'Код', req: false, prompt: '🏷 Код/бренд (напр. DEPOT / NO. 106)' },
    { key: 'price', label: 'Ціна', req: true, prompt: '💰 Ціна, грн (лише число)' },
    { key: 'volume', label: 'Обʼєм', req: false, prompt: '📦 Обʼєм (напр. 250 ml)' },
    { key: 'sub', label: 'Опис', req: false, prompt: '📄 Короткий опис' },
    { key: 'tile', label: 'Плитка', req: false, prompt: '' } // buttons-only, handled separately
];
const DOTS = (i, n) => '●'.repeat(i) + '○'.repeat(n - i);
// Callbacks that show a CUSTOM toast message — everything else is auto-answered
// silently up front so buttons never show an infinite loading spinner.
const CUSTOM_TOAST = /^cet:|^cdel:|^cdelc:|^delorder:|^delorderc:|^cef:[^:]*:tile$/;

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
                { command: 'catalog', description: '📦 Каталог товарів' },
                { command: 'orders', description: '📥 Замовлення' },
                { command: 'help', description: '❓ Довідка' }
            ] });
            await tg('setChatMenuButton', { menu_button: { type: 'commands' } });
            await tg('setMyShortDescription', { short_description: 'Адмін-панель магазину FERDINAND.' });
            await tg('setMyDescription', { description: 'Адмін-панель магазину FERDINAND BARBERSHOP.\nКеруй товарами і замовленнями прямо звідси — /menu.' });
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
    const cardMsgId = cbq ? cbq.message.message_id : null; // present only for callbacks

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rawUrl = (path) => `https://raw.githubusercontent.com/${repo}/main/${String(path).split('/').map(encodeURIComponent).join('/')}`;

    // Send a brand-new text screen.
    const send = (text, extra = {}) => tg('sendMessage', { chat_id: chatId, disable_web_page_preview: true, parse_mode: 'HTML', ...extra, text });
    // Update the CURRENT screen in place (callback context) — falls back to a new message otherwise.
    const screen = async (text, extra = {}) => {
        if (cardMsgId) {
            const r = await tg('editMessageText', { chat_id: chatId, message_id: cardMsgId, disable_web_page_preview: true, parse_mode: 'HTML', ...extra, text });
            if (r && r.ok) return r;
        }
        return send(text, extra);
    };
    // Update a photo card in place (media + caption + buttons) — falls back to a fresh photo message.
    const photoScreen = async (photo, caption, extra = {}) => {
        if (cardMsgId) {
            const r = await tg('editMessageMedia', {
                chat_id: chatId, message_id: cardMsgId,
                media: { type: 'photo', media: photo, caption, parse_mode: 'HTML' },
                ...extra
            });
            if (r && r.ok) return r;
            console.error('editMessageMedia failed, falling back to sendPhoto:', JSON.stringify(r));
        }
        const r2 = await tg('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra });
        if (!r2 || !r2.ok) console.error('sendPhoto failed:', JSON.stringify(r2));
        return r2;
    };
    // Cosmetically clear the buttons on the current screen (photo or text) before
    // sending a separate force_reply prompt — silent best-effort, never sends a
    // duplicate message (unlike screen()/photoScreen(), which fall back to a new send).
    const clearButtons = async () => {
        if (!cardMsgId) return;
        if (cbq.message.photo) {
            await tg('editMessageCaption', { chat_id: chatId, message_id: cardMsgId, caption: cbq.message.caption || '', parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }).catch(() => {});
        } else {
            await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cardMsgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        }
    };
    // Answers the callback exactly once (Telegram allows only a single answer per tap).
    let cbAnswered = false;
    const toast = (text, alert) => {
        if (!cbq || cbAnswered) return;
        cbAnswered = true;
        return tg('answerCallbackQuery', { callback_query_id: cbq.id, text: text || '', show_alert: !!alert });
    };

    const menuKb = () => ({ inline_keyboard: [
        [{ text: '📦 Каталог товарів', callback_data: 'cat:0' }],
        [{ text: '➕ Додати товар', callback_data: 'wiz:0' }, { text: '📥 Замовлення', callback_data: 'orders:0' }],
        [{ text: '❓ Довідка', callback_data: 'help' }]
    ] });
    const backKb = (extra = []) => ({ inline_keyboard: [...extra, [{ text: '🏠 Меню', callback_data: 'menu' }]] });

    // ---- auth ----
    if (!admins.includes(fromId)) {
        if (cbq) await tg('answerCallbackQuery', { callback_query_id: cbq.id, text: '⛔ Немає доступу', show_alert: true });
        else await send(`⛔ Ця адмін-панель лише для власників.\n\n🆔 Твій Telegram ID: <code>${fromId}</code>\nНадішли його власнику — і він додасть тобі доступ.`);
        return res.status(200).json({ ok: true });
    }
    if (!ghToken) { await send('⚙️ Немає GITHUB_TOKEN — скажи розробнику.'); return res.status(200).json({ ok: true }); }

    try {
        // ================= CALLBACK BUTTONS =================
        if (cbq) {
            const data = cbq.data || '';
            if (!CUSTOM_TOAST.test(data)) toast(); // silent ack — keeps the button responsive

            // Cache the Telegram file_id after the first time a product's photo is
            // sent by URL — every later view reuses it (instant, no external
            // fetch, works identically on phone and desktop).
            async function cacheFileId(idx, result) {
                try {
                    if (!result || !result.ok || !result.result || !Array.isArray(result.result.photo)) return;
                    const largest = result.result.photo[result.result.photo.length - 1];
                    if (!largest) return;
                    const { data, sha } = await getJson(ghToken, repo);
                    if (!data[idx] || data[idx].tgFileId === largest.file_id) return;
                    data[idx].tgFileId = largest.file_id;
                    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: cache photo for product #${idx + 1}`, sha);
                } catch (e) { console.error('cacheFileId failed:', e.message); }
            }

            async function renderCard(idx) {
                const { data } = await getJson(ghToken, repo);
                if (!data.length) return screen('📦 Товарів поки немає.', { reply_markup: backKb([[{ text: '➕ Додати товар', callback_data: 'wiz:0' }]]) });
                const n = data.length;
                idx = ((idx % n) + n) % n;
                const p = data[idx];
                const tileIcon = p.tile === 'dark' ? '⬛' : '⬜';
                const caption = `📦 <b>${esc(p.name || '—')}</b>\n${esc(p.code || '')}\n💰 ${p.price || 0} ₴ ${p.volume ? '· ' + esc(p.volume) : ''} ${tileIcon}`;
                const kb = { inline_keyboard: [
                    [{ text: '◀', callback_data: `cat:${idx - 1}` }, { text: `${idx + 1} / ${n}`, callback_data: `catlist:${Math.floor(idx / 10)}` }, { text: '▶', callback_data: `cat:${idx + 1}` }],
                    [{ text: '✏️ Редагувати', callback_data: `cedit:${idx}` }, { text: '🗑 Видалити', callback_data: `cdel:${idx}` }],
                    [{ text: '➕ Додати', callback_data: 'wiz:0' }, { text: '🏠 Меню', callback_data: 'menu' }]
                ] };
                const result = await photoScreen(p.tgFileId || rawUrl(p.image), caption, { reply_markup: kb });
                if (!p.tgFileId) await cacheFileId(idx, result).catch(() => {});
                return result;
            }

            async function renderEditCard(idx) {
                const { data } = await getJson(ghToken, repo);
                const n = data.length; if (!n) return screen('Товару вже немає.', { reply_markup: backKb() });
                idx = ((idx % n) + n) % n;
                const p = data[idx];
                const caption = `✏️ <b>Редагування · #${idx + 1}</b>\n\n📝 ${esc(p.name || '—')}\n🏷 ${esc(p.code || '—')}\n💰 ${p.price || '—'} ₴\n📦 ${esc(p.volume || '—')}\n📄 ${esc(p.sub || '—')}\n🎨 ${p.tile === 'dark' ? 'темна' : 'світла'}`;
                const kb = { inline_keyboard: [
                    [{ text: '📝 Назва', callback_data: `cef:${idx}:name` }, { text: '🏷 Код', callback_data: `cef:${idx}:code` }],
                    [{ text: '💰 Ціна', callback_data: `cef:${idx}:price` }, { text: '📦 Обʼєм', callback_data: `cef:${idx}:volume` }],
                    [{ text: '📄 Опис', callback_data: `cef:${idx}:sub` }, { text: '🖼 Фото', callback_data: `cef:${idx}:photo` }],
                    [{ text: '⬜ Світла', callback_data: `cet:${idx}:light` }, { text: '⬛ Темна', callback_data: `cet:${idx}:dark` }],
                    [{ text: '↩️ До картки', callback_data: `cat:${idx}` }, { text: '🗑 Видалити', callback_data: `cdel:${idx}` }]
                ] };
                const result = await photoScreen(p.tgFileId || rawUrl(p.image), caption, { reply_markup: kb });
                if (!p.tgFileId) await cacheFileId(idx, result).catch(() => {});
                return result;
            }

            async function renderIndex(page) {
                const { data } = await getJson(ghToken, repo);
                if (!data.length) return screen('📦 Товарів поки немає.', { reply_markup: backKb() });
                const PER = 10;
                const pages = Math.ceil(data.length / PER);
                page = ((page % pages) + pages) % pages;
                const slice = data.slice(page * PER, page * PER + PER);
                const rows = slice.map((p, i) => {
                    const idx = page * PER + i;
                    return [{ text: `${idx + 1}. ${(p.name || '').slice(0, 26)} — ${p.price} ₴`, callback_data: `cat:${idx}` }];
                });
                const nav = [];
                if (pages > 1) nav.push({ text: '◀', callback_data: `catlist:${page - 1}` }, { text: `${page + 1}/${pages}`, callback_data: `catlist:${page}` }, { text: '▶', callback_data: `catlist:${page + 1}` });
                if (nav.length) rows.push(nav);
                rows.push([{ text: '🏠 Меню', callback_data: 'menu' }]);
                return screen('📋 <b>Каталог</b> — обери товар:', { reply_markup: { inline_keyboard: rows } });
            }

            async function renderOrders(page) {
                const orders = await listOrders();
                if (orders === null) return screen('📥 Сховище замовлень ще не підключено. Скажи розробнику.', { reply_markup: backKb() });
                if (!orders.length) return screen('📥 Замовлень поки немає.', { reply_markup: backKb() });
                const PER = 8;
                const pages = Math.ceil(orders.length / PER);
                page = ((page % pages) + pages) % pages;
                const slice = orders.slice(page * PER, page * PER + PER);
                const rows = slice.map((o) => [
                    { text: `👁 ${(o.name || '—').slice(0, 16)} · ${o.total || ''}`.trim(), callback_data: `vieworder:${o.id}` },
                    { text: '🗑', callback_data: `delorder:${o.id}` }
                ]);
                const nav = [];
                if (pages > 1) nav.push({ text: '◀', callback_data: `orders:${page - 1}` }, { text: `${page + 1}/${pages}`, callback_data: `orders:${page}` }, { text: '▶', callback_data: `orders:${page + 1}` });
                if (nav.length) rows.push(nav);
                rows.push([{ text: '🏠 Меню', callback_data: 'menu' }]);
                return screen(`📥 <b>Замовлення</b> (${orders.length})`, { reply_markup: { inline_keyboard: rows } });
            }

            async function renderOrderView(id) {
                const o = await getOrder(id);
                if (!o) return screen('Замовлення вже немає.', { reply_markup: backKb() });
                const date = new Date(o.ts || Date.now()).toLocaleString('uk-UA');
                return screen(`📦 <b>Замовлення</b> · ${esc(date)}\n\n${esc(o.text || '')}`, { reply_markup: { inline_keyboard: [[
                    { text: '🗑 Видалити', callback_data: `delorder:${id}` }, { text: '↩️ До списку', callback_data: 'orders:0' }]] } });
            }

            function sendWizardStep(stepIdx, draft, isEdit) {
                const total = FIELDS.length;
                if (stepIdx >= total) {
                    const text = `📸 <b>Новий товар</b> · ${DOTS(total, total)}\n\nНадішли ФОТО товару у відповідь на це повідомлення.\n\n${renderDraft(draft)}`;
                    return (isEdit ? clearButtons() : Promise.resolve())
                        .then(() => send(text, { reply_markup: { force_reply: true } }));
                }
                const f = FIELDS[stepIdx];
                if (f.key === 'tile') {
                    const text = `🎨 <b>Новий товар</b> · ${DOTS(stepIdx, total)}\nОбери тло плитки:\n\n${renderDraft(draft)}`;
                    const kb = { inline_keyboard: [[{ text: '⬜ Світла', callback_data: `wtile:${stepIdx}:light` }, { text: '⬛ Темна', callback_data: `wtile:${stepIdx}:dark` }]] };
                    return isEdit ? screen(text, { reply_markup: kb }) : send(text, { reply_markup: kb });
                }
                const text = `${f.req ? '✍️' : '🧭'} <b>Новий товар</b> · ${DOTS(stepIdx, total)}\n${f.prompt}\n\n${renderDraft(draft)}`;
                if (f.req) {
                    return (isEdit ? clearButtons() : Promise.resolve())
                        .then(() => send(text, { reply_markup: { force_reply: true } }));
                }
                const kb = { inline_keyboard: [[{ text: '⏭ Пропустити', callback_data: `wskip:${stepIdx}` }]] };
                return isEdit ? screen(text, { reply_markup: kb }) : send(text, { reply_markup: kb });
            }

            if (data === 'menu') return done(res, await screen(MENU_TXT, { reply_markup: menuKb() }));
            if (data === 'help') return done(res, await screen(HELP_TXT, { reply_markup: backKb() }));

            // ---- catalog (photo cards) ----
            if (data.startsWith('cat:')) return done(res, await renderCard(+data.slice(4)));
            if (data.startsWith('catlist:')) return done(res, await renderIndex(+data.slice(8)));
            if (data.startsWith('cedit:')) return done(res, await renderEditCard(+data.slice(6)));
            if (data.startsWith('cef:')) {
                const [, idxS, field] = data.split(':');
                if (field === 'tile') { toast('🎨 Обери тло на картці нижче ↓'); return done(res, await renderEditCard(+idxS)); }
                const labels = { name: 'Назва', code: 'Код', price: 'Ціна', volume: 'Обʼєм', sub: 'Опис' };
                const hint = field === 'photo' ? '🖼 Надішли нове ФОТО у відповідь на це повідомлення.' : `✍️ Напиши нове значення (${labels[field]}) у відповідь на це повідомлення.`;
                return done(res, await send(`${hint}\n\n<i>Товар #${+idxS + 1} · картка #${cardMsgId}</i>`, { reply_markup: { force_reply: true } }));
            }
            if (data.startsWith('cet:')) {
                const [, idxS, tile] = data.split(':');
                await updateProduct(ghToken, repo, +idxS, { tile });
                toast('✅ Тло оновлено');
                return done(res, await renderEditCard(+idxS));
            }
            if (data.startsWith('cdelc:')) {
                const idx = +data.slice(6);
                const rm = await deleteProduct(ghToken, repo, idx);
                toast(rm ? '🗑 Видалено' : 'Вже видалено');
                return done(res, await renderCard(idx));
            }
            if (data.startsWith('cdel:')) {
                const idx = +data.slice(5); const { data: arr } = await getJson(ghToken, repo);
                if (!arr[idx]) { toast('Товару вже немає', true); return done(res, await renderIndex(0)); }
                toast();
                return done(res, await photoScreen(rawUrl(arr[idx].image), `🗑 <b>Видалити «${esc(arr[idx].name)}»?</b>\nЦю дію не можна скасувати.`,
                    { reply_markup: { inline_keyboard: [[{ text: '✅ Так, видалити', callback_data: `cdelc:${idx}` }, { text: '↩️ Скасувати', callback_data: `cedit:${idx}` }]] } }));
            }

            // ---- wizard (add product) ----
            if (data.startsWith('wiz:')) return done(res, await sendWizardStep(0, {}, true));
            if (data.startsWith('wskip:')) {
                const step = +data.slice(6);
                const draft = parseDraft(cbq.message.text || cbq.message.caption || '');
                return done(res, await sendWizardStep(step + 1, draft, true));
            }
            if (data.startsWith('wtile:')) {
                const [, stepS, tile] = data.split(':');
                const draft = parseDraft(cbq.message.text || cbq.message.caption || '');
                draft.tile = tile;
                return done(res, await sendWizardStep(+stepS + 1, draft, true));
            }

            // ---- orders ----
            if (data.startsWith('orders:')) return done(res, await renderOrders(+data.slice(7)));
            if (data.startsWith('vieworder:')) return done(res, await renderOrderView(data.slice(10)));
            if (data.startsWith('delorderc:')) { await deleteOrder(data.slice(10)); toast('🗑 Видалено'); return done(res, await renderOrders(0)); }
            if (data.startsWith('delorder:')) {
                const id = data.slice(9); const o = await getOrder(id);
                if (!o) { toast('Замовлення вже немає', true); return done(res, await renderOrders(0)); }
                toast();
                return done(res, await screen(`🗑 <b>Видалити замовлення від ${esc(o.name || '—')}?</b>`, { reply_markup: { inline_keyboard: [[
                    { text: '✅ Так', callback_data: `delorderc:${id}` }, { text: '↩️ Скасувати', callback_data: `vieworder:${id}` }]] } }));
            }

            toast();
            return done(res, await screen(MENU_TXT, { reply_markup: menuKb() }));
        }

        // ================= INCOMING MESSAGES =================
        const text = (msg.text || msg.caption || '').trim();

        // ---- wizard: reply to a step prompt ----
        if (msg.reply_to_message && /Новий товар/.test(msg.reply_to_message.text || '')) {
            return done(res, await handleWizardReply(msg));
        }
        // ---- edit-field: reply to a "написати нове значення" prompt ----
        if (msg.reply_to_message && /картка #\d+/.test(msg.reply_to_message.text || '')) {
            return done(res, await handleEditFieldReply(msg));
        }

        // ---- commands ----
        if (/^\/(start|menu)/i.test(text)) return done(res, await send(MENU_TXT, { reply_markup: menuKb() }));
        if (/^\/help/i.test(text)) return done(res, await send(HELP_TXT, { reply_markup: backKb() }));
        if (/^\/catalog/i.test(text)) return done(res, await renderCardNew(0));
        if (/^\/orders/i.test(text)) return done(res, await renderOrdersNew(0));

        // ---- power-user shortcut: photo + caption fields in one message ----
        if (msg.photo && msg.photo.length) {
            const f = parseFields(text);
            if (!f.name || !f.price) return done(res, await send('❗ Потрібні хоча б «Назва:» і «Ціна:» в підписі. Простіше натисни ➕ у /menu.'));
            const largest = msg.photo[msg.photo.length - 1];
            const image = await commitPhoto(token, ghToken, repo, largest.file_id);
            const p = buildProduct(f, image, largest.file_id);
            const idx = await addProduct(ghToken, repo, p);
            return done(res, await renderCardNew(idx));
        }

        return done(res, await send(MENU_TXT, { reply_markup: menuKb() }));

        // ---------------------------------------------------------------
        // Message-context helpers (no existing message to edit — always send new)
        // ---------------------------------------------------------------
        async function renderCardNew(idx) {
            const { data } = await getJson(ghToken, repo);
            if (!data.length) return send('📦 Товарів поки немає.', { reply_markup: backKb([[{ text: '➕ Додати товар', callback_data: 'wiz:0' }]]) });
            const n = data.length; idx = ((idx % n) + n) % n;
            const p = data[idx];
            const tileIcon = p.tile === 'dark' ? '⬛' : '⬜';
            const caption = `📦 <b>${esc(p.name || '—')}</b>\n${esc(p.code || '')}\n💰 ${p.price || 0} ₴ ${p.volume ? '· ' + esc(p.volume) : ''} ${tileIcon}`;
            const kb = { inline_keyboard: [
                [{ text: '◀', callback_data: `cat:${idx - 1}` }, { text: `${idx + 1} / ${n}`, callback_data: `catlist:${Math.floor(idx / 10)}` }, { text: '▶', callback_data: `cat:${idx + 1}` }],
                [{ text: '✏️ Редагувати', callback_data: `cedit:${idx}` }, { text: '🗑 Видалити', callback_data: `cdel:${idx}` }],
                [{ text: '➕ Додати', callback_data: 'wiz:0' }, { text: '🏠 Меню', callback_data: 'menu' }]
            ] };
            return tg('sendPhoto', { chat_id: chatId, photo: p.tgFileId || rawUrl(p.image), caption, parse_mode: 'HTML', reply_markup: kb });
        }
        async function renderOrdersNew(page) {
            const orders = await listOrders();
            if (orders === null) return send('📥 Сховище замовлень ще не підключено. Скажи розробнику.', { reply_markup: backKb() });
            if (!orders.length) return send('📥 Замовлень поки немає.', { reply_markup: backKb() });
            const rows = orders.slice(0, 8).map((o) => [
                { text: `👁 ${(o.name || '—').slice(0, 16)} · ${o.total || ''}`.trim(), callback_data: `vieworder:${o.id}` },
                { text: '🗑', callback_data: `delorder:${o.id}` }
            ]);
            rows.push([{ text: '🏠 Меню', callback_data: 'menu' }]);
            return send(`📥 <b>Замовлення</b> (${orders.length})`, { reply_markup: { inline_keyboard: rows } });
        }

        async function handleEditFieldReply(m) {
            const prev = m.reply_to_message.text || '';
            const idx = (Number((prev.match(/Товар #(\d+)/) || [])[1]) || 1) - 1;
            const promptMsgId = Number((prev.match(/картка #(\d+)/) || [])[1]);
            const isPhoto = /Надішли нове ФОТО/.test(prev);
            const fieldMap = { 'Назва': 'name', 'Код': 'code', 'Ціна': 'price', 'Обʼєм': 'volume', 'Опис': 'sub' };
            const fieldLabel = (prev.match(/\((Назва|Код|Ціна|Обʼєм|Опис)\)/) || [])[1];
            if (isPhoto) {
                if (!(m.photo && m.photo.length)) return send('🖼 Потрібне саме ФОТО — надішли у відповідь.', { reply_markup: { force_reply: true } });
                const largest = m.photo[m.photo.length - 1];
                const image = await commitPhoto(token, ghToken, repo, largest.file_id);
                await updateProduct(ghToken, repo, idx, {}, image, largest.file_id);
            } else {
                const key = fieldMap[fieldLabel];
                const val = (m.text || '').trim();
                if (!key || !val) return send('Порожньо — спробуй ще раз.', { reply_markup: { force_reply: true } });
                await updateProduct(ghToken, repo, idx, { [key]: val });
            }
            tg('deleteMessage', { chat_id: chatId, message_id: m.reply_to_message.message_id }).catch(() => {});
            if (promptMsgId) {
                const { data } = await getJson(ghToken, repo); const p = data[idx];
                if (p) {
                    const caption = `✏️ <b>Редагування · #${idx + 1}</b>\n\n📝 ${esc(p.name || '—')}\n🏷 ${esc(p.code || '—')}\n💰 ${p.price || '—'} ₴\n📦 ${esc(p.volume || '—')}\n📄 ${esc(p.sub || '—')}\n🎨 ${p.tile === 'dark' ? 'темна' : 'світла'}`;
                    const kb = { inline_keyboard: [
                        [{ text: '📝 Назва', callback_data: `cef:${idx}:name` }, { text: '🏷 Код', callback_data: `cef:${idx}:code` }],
                        [{ text: '💰 Ціна', callback_data: `cef:${idx}:price` }, { text: '📦 Обʼєм', callback_data: `cef:${idx}:volume` }],
                        [{ text: '📄 Опис', callback_data: `cef:${idx}:sub` }, { text: '🖼 Фото', callback_data: `cef:${idx}:photo` }],
                        [{ text: '⬜ Світла', callback_data: `cet:${idx}:light` }, { text: '⬛ Темна', callback_data: `cet:${idx}:dark` }],
                        [{ text: '↩️ До картки', callback_data: `cat:${idx}` }, { text: '🗑 Видалити', callback_data: `cdel:${idx}` }]
                    ] };
                    await tg('editMessageMedia', { chat_id: chatId, message_id: promptMsgId, media: { type: 'photo', media: p.tgFileId || rawUrl(p.image), caption, parse_mode: 'HTML' }, reply_markup: kb }).catch(() => {});
                }
            }
            return { ok: true };
        }

        async function handleWizardReply(m) {
            const prev = m.reply_to_message.text || '';
            const draft = parseDraft(prev);
            if (/Надішли ФОТО/.test(prev)) {
                if (!(m.photo && m.photo.length)) return send('🖼 Надішли саме ФОТО у відповідь на повідомлення вище.', { reply_markup: { force_reply: true } });
                const largest = m.photo[m.photo.length - 1];
                const image = await commitPhoto(token, ghToken, repo, largest.file_id);
                const p = buildProduct(draft, image, largest.file_id);
                const idx = await addProduct(ghToken, repo, p);
                return renderCardNew(idx);
            }
            const filled = (prev.match(/●/g) || []).length; // how many steps already completed
            const field = FIELDS[filled];
            const val = (m.text || '').trim();
            if (field.req && (!val || (field.key === 'price' && !val.replace(/\D/g, '')))) {
                const retryText = `${field.req ? '✍️' : '🧭'} <b>Новий товар</b> · ${DOTS(filled, FIELDS.length)}\n${field.prompt}\n\n${renderDraft(draft)}`;
                return send(retryText, { reply_markup: { force_reply: true } });
            }
            if (val) draft[field.key] = field.key === 'price' ? val.replace(/\D/g, '') : val;
            const next = filled + 1;
            if (next >= FIELDS.length) {
                const text = `📸 <b>Новий товар</b> · ${DOTS(FIELDS.length, FIELDS.length)}\n\nНадішли ФОТО товару у відповідь на це повідомлення.\n\n${renderDraft(draft)}`;
                return send(text, { reply_markup: { force_reply: true } });
            }
            const f = FIELDS[next];
            if (f.key === 'tile') {
                const text = `🎨 <b>Новий товар</b> · ${DOTS(next, FIELDS.length)}\nОбери тло плитки:\n\n${renderDraft(draft)}`;
                return send(text, { reply_markup: { inline_keyboard: [[{ text: '⬜ Світла', callback_data: `wtile:${next}:light` }, { text: '⬛ Темна', callback_data: `wtile:${next}:dark` }]] } });
            }
            const text = `${f.req ? '✍️' : '🧭'} <b>Новий товар</b> · ${DOTS(next, FIELDS.length)}\n${f.prompt}\n\n${renderDraft(draft)}`;
            if (f.req) return send(text, { reply_markup: { force_reply: true } });
            return send(text, { reply_markup: { inline_keyboard: [[{ text: '⏭ Пропустити', callback_data: `wskip:${next}` }]] } });
        }
    } catch (e) {
        console.error('bot handler error:', e && e.stack || e);
        await send('⚠️ Помилка: ' + (e && e.message ? e.message : e));
        return res.status(200).json({ ok: true });
    }
};

async function commitPhoto(token, ghToken, repo, fileId) {
    const meta = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
    if (!meta.ok) throw new Error('getFile failed');
    const bytes = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`)).arrayBuffer());
    const name = `${IMG_DIR}/bot-${Date.now()}.jpg`;
    await putFile(ghToken, repo, name, bytes, `bot: product image ${name}`);
    return name;
}

const done = (res) => res.status(200).json({ ok: true });

// ---------- static text screens ----------
const MENU_TXT = '🐂 <b>FERDINAND</b> — адмін-панель\n\nКеруй магазином прямо звідси.';
const HELP_TXT = [
    '❓ <b>Довідка</b>', '',
    '📦 <b>Каталог</b> — гортай ◀▶, редагуй чи видаляй будь-який товар.',
    '✏️ <b>Редагувати</b> — тапни поле (назва/ціна/фото/…), напиши нове значення.',
    '➕ <b>Додати</b> — я спитаю по одному пункту; необовʼязкові можна пропустити.',
    '📥 <b>Замовлення</b> — перегляд і видалення.', '',
    'Зміни зʼявляються на сайті за ~1 хв.'
].join('\n');

// ---------- wizard draft helpers ----------
function renderDraft(d) {
    return FIELDS.filter((f) => f.key !== 'tile').map((f) => `${f.label}: ${d[f.key] || '—'}`).join('\n')
        + (d.tile ? `\nПлитка: ${d.tile === 'dark' ? 'темна' : 'світла'}` : '');
}
function parseDraft(text) {
    const d = {};
    for (const f of FIELDS) {
        if (f.key === 'tile') { if (/Плитка: (темна|світла)/.test(text)) d.tile = /темна/.test(text) ? 'dark' : 'light'; continue; }
        const m = String(text).match(new RegExp('^' + f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*(.*)$', 'm'));
        if (m) { const v = m[1].trim(); if (v && v !== '—') d[f.key] = v; }
    }
    return d;
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
function buildProduct(f, image, tgFileId) {
    return {
        code: f.code && f.code !== '—' ? f.code : 'DEPOT',
        name: f.name, sub: f.sub && f.sub !== '—' ? f.sub : '',
        volume: f.volume && f.volume !== '—' ? f.volume : '',
        price: Number(String(f.price).replace(/\D/g, '')) || 0,
        image, tgFileId, tile: /dark|темна/i.test(f.tile || '') ? 'dark' : 'light',
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
async function addProduct(ghToken, repo, product) {
    const { data, sha } = await getJson(ghToken, repo);
    data.push(product);
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: add "${product.name}"`, sha);
    return data.length - 1;
}
async function updateProduct(ghToken, repo, index, fields, image, tgFileId) {
    const { data, sha } = await getJson(ghToken, repo);
    if (index < 0 || index >= data.length) return null;
    const p = data[index];
    if (fields.name) p.name = fields.name;
    if (fields.code) p.code = fields.code;
    if (fields.price) p.price = Number(String(fields.price).replace(/\D/g, '')) || p.price;
    if (fields.volume !== undefined) p.volume = fields.volume === '-' ? '' : fields.volume;
    if (fields.sub !== undefined) p.sub = fields.sub === '-' ? '' : fields.sub;
    if (fields.tile) p.tile = /dark|темна/i.test(fields.tile) ? 'dark' : 'light';
    if (image) { p.image = image; p.tgFileId = tgFileId || undefined; }
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: edit "${p.name}"`, sha);
    return p;
}
async function deleteProduct(ghToken, repo, index) {
    const { data, sha } = await getJson(ghToken, repo);
    if (index < 0 || index >= data.length) return null;
    const [rm] = data.splice(index, 1);
    await putFile(ghToken, repo, PRODUCTS_PATH, Buffer.from(JSON.stringify(data, null, 2) + '\n'), `bot: delete "${rm.name}"`, sha);
    return rm;
}
