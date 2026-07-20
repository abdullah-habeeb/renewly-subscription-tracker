const { admin, db, hasFirestore } = require('../firebase');

/**
 * Server-side twin of the client's storeDetectedCandidates
 * (web/src/lib/data.ts + dedupe.ts) for background scans, where there is no
 * signed-in client to do the writing. Same policy, Admin SDK writes:
 *  - names already tracked as subscriptions never re-appear;
 *  - real scans delete demo leftovers and never dedupe against them;
 *  - real-sourced detected docs (any status, incl. dismissed) block re-offering.
 */
async function storeCandidates(uid, items, source) {
  if (!hasFirestore) return { stored: 0, storedItems: [] };

  const [subsSnap, detectedSnap] = await Promise.all([
    db.collection('subscriptions').where('uid', '==', uid).get(),
    db.collection('detected').where('uid', '==', uid).get(),
  ]);

  const isRealScan = source !== 'demo';
  const blocked = new Set(subsSnap.docs.map((d) => String(d.data().name || '').toLowerCase()));
  const staleIds = [];
  for (const docSnap of detectedSnap.docs) {
    const data = docSnap.data();
    if (isRealScan && (data.source || 'demo') === 'demo') {
      staleIds.push(docSnap.id);
      continue;
    }
    blocked.add(String(data.name || '').toLowerCase());
  }

  await Promise.all(staleIds.map((id) => db.collection('detected').doc(id).delete()));

  const storedItems = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (blocked.has(key)) continue;
    blocked.add(key);
    await db.collection('detected').add({
      ...item,
      uid,
      status: 'pending',
      source,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    storedItems.push(item);
  }

  // Mirror of the client's price-change detection (web/src/lib/dedupe.ts):
  // a candidate matching a tracked subscription at a different amount flags
  // the subscription instead of creating a row. Real scans only.
  let priceChanges = 0;
  if (isRealScan) {
    const byName = new Map(
      subsSnap.docs.map((d) => [String(d.data().name || '').toLowerCase(), d]),
    );
    const flagged = new Set();
    for (const item of items) {
      const subDoc = byName.get(item.name.toLowerCase());
      if (!subDoc || flagged.has(subDoc.id)) continue;
      const sub = subDoc.data();
      if (sub.billingCycle !== item.billingCycle) continue;
      if (Math.abs(item.amount - sub.amount) < Math.max(1, sub.amount * 0.02)) continue;
      if (sub.dismissedPriceAmount === item.amount) continue;
      flagged.add(subDoc.id);
      await subDoc.ref.update({
        pendingPriceChange: {
          newAmount: item.amount,
          detectedAt: new Date().toISOString().split('T')[0],
        },
      });
      priceChanges++;
    }
  }

  return { stored: storedItems.length, storedItems, priceChanges };
}

module.exports = { storeCandidates };
