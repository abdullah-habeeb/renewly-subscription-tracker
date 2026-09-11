const { admin, db, hasFirestore } = require('../firebase');

/**
 * Server-side twin of the client's storeDetectedCandidates
 * (web/src/lib/data.ts + dedupe.ts) for background scans, where there is no
 * signed-in client to do the writing. Same policy, Admin SDK writes:
 *  - names already tracked as subscriptions never re-appear;
 *  - real scans delete demo leftovers and never dedupe against them;
 *  - real-sourced detected docs (any status, incl. dismissed) block re-offering.
 */
async function storeCandidates(uid, items, source, cancellations = []) {
  if (!hasFirestore) return { stored: 0, storedItems: [], priceChanges: 0, cancellationsFlagged: 0 };

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
      // needsDetails candidates carry a placeholder amount (0), never a real
      // price — comparing that against a tracked subscription would flag a
      // bogus "price dropped to ₹0".
      if (item.needsDetails) continue;
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

  // Mirror of the client's cancellation matching (web/src/lib/dedupe.ts):
  // a cancellation-confirmation email matching a tracked, still-active
  // subscription proposes marking it cancelled — never applied automatically.
  let cancellationsFlagged = 0;
  if (isRealScan && cancellations.length > 0) {
    const byName = new Map(
      subsSnap.docs.map((d) => [String(d.data().name || '').toLowerCase(), d]),
    );
    for (const c of cancellations) {
      const subDoc = byName.get(c.name.toLowerCase());
      if (!subDoc) continue;
      const sub = subDoc.data();
      if (sub.status === 'cancelled') continue;
      if (sub.dismissedCancellationDate === c.date) continue;
      await subDoc.ref.update({
        pendingCancellation: {
          detectedAt: c.date,
          evidence: c.subject,
          sourceAccounts: c.sourceAccounts || [],
        },
      });
      cancellationsFlagged++;
    }
  }

  return { stored: storedItems.length, storedItems, priceChanges, cancellationsFlagged };
}

module.exports = { storeCandidates };
