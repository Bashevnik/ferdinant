// Minimal Vercel KV / Upstash Redis REST client for order storage.
// No-ops gracefully until KV_REST_API_URL + KV_REST_API_TOKEN exist,
// so /api/order keeps working before the store is provisioned.
// Works with Vercel KV or an Upstash Redis integration (either env naming).
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ORDERS = 'orders';

const kvEnabled = () => !!(KV_URL && KV_TOKEN);

async function cmd(args) {
    const r = await fetch(KV_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
    });
    const j = await r.json();
    if (j.error) throw new Error('KV: ' + j.error);
    return j.result;
}

async function saveOrder(order) {
    if (!kvEnabled()) return false;
    await cmd(['HSET', ORDERS, order.id, JSON.stringify(order)]);
    return true;
}

async function listOrders() {
    if (!kvEnabled()) return null; // null = store not configured yet
    const flat = (await cmd(['HGETALL', ORDERS])) || [];
    const out = [];
    for (let i = 1; i < flat.length; i += 2) {
        try { out.push(JSON.parse(flat[i])); } catch { /* skip */ }
    }
    return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

async function getOrder(id) {
    if (!kvEnabled()) return null;
    const v = await cmd(['HGET', ORDERS, id]);
    try { return v ? JSON.parse(v) : null; } catch { return null; }
}

async function deleteOrder(id) {
    if (!kvEnabled()) return false;
    await cmd(['HDEL', ORDERS, id]);
    return true;
}

module.exports = { kvEnabled, saveOrder, listOrders, getOrder, deleteOrder };
