const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Callable Function: getSpendingReport
 * Server-side spending analytics for the authenticated user.
 * Called via httpsCallable — auth token is verified automatically.
 */
exports.getSpendingReport = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to get a spending report.",
    );
  }

  const uid = request.auth.uid;

  const snapshot = await db
      .collection("subscriptions")
      .where("uid", "==", uid)
      .get();

  let monthlyTotal = 0;
  let yearlyEquivalent = 0;
  const categoryBreakdown = {};
  const upcomingDues = [];

  snapshot.forEach((doc) => {
    const sub = doc.data();
    const monthlyCost =
      sub.billingCycle === "monthly" ? sub.amount : sub.amount / 12;

    monthlyTotal += monthlyCost;
    yearlyEquivalent +=
      sub.billingCycle === "yearly" ? sub.amount : sub.amount * 12;
    categoryBreakdown[sub.category] =
      (categoryBreakdown[sub.category] || 0) + monthlyCost;

    upcomingDues.push({
      name: sub.name,
      nextDueDate: sub.nextDueDate,
      amount: sub.amount,
      billingCycle: sub.billingCycle,
    });
  });

  upcomingDues.sort(
      (a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate),
  );

  logger.info(`[getSpendingReport] UID: ${uid}, subs: ${snapshot.size}`);

  return {
    monthlyTotal: parseFloat(monthlyTotal.toFixed(2)),
    yearlyEquivalent: parseFloat(yearlyEquivalent.toFixed(2)),
    totalSubscriptions: snapshot.size,
    categoryBreakdown,
    upcomingDues: upcomingDues.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
});

/**
 * Firestore Trigger: onSubscriptionCreated
 * Validates, sanitizes, and enriches every new subscription document.
 */
exports.onSubscriptionCreated = onDocumentCreated(
    "subscriptions/{docId}",
    async (event) => {
      const snapshot = event.data;
      if (!snapshot) return;

      const data = snapshot.data();
      const updates = {};

      if (data.category) {
        const normalized = data.category
            .trim()
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
        if (normalized !== data.category) {
          updates.category = normalized;
        }
      }

      if (data.name && data.name !== data.name.trim()) {
        updates.name = data.name.trim();
      }

      if (typeof data.amount === "number" && data.amount < 0) {
        updates.amount = Math.abs(data.amount);
      }

      updates.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await snapshot.ref.update(updates);

      logger.info(
          `[onSubscriptionCreated] "${data.name}" for UID: ${data.uid}`,
      );
    },
);
