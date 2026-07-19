import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import { planDedupe } from "./dedupe";
import {
  calculateNextDueDate,
  type BillingCycle,
  type DetectedSubscription,
  type Subscription,
  type UserSettings,
} from "./types";

// ---------- Subscriptions ----------

export function useSubscriptions(user: User | null) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "subscriptions"),
      where("uid", "==", user.uid),
      orderBy("nextDueDate"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSubs(snap.docs.map((d) => ({ ...(d.data() as Omit<Subscription, "id">), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.error("subscriptions listener:", err);
        setLoading(false);
      },
    );
  }, [user]);

  return { subs, loading };
}

export interface SubscriptionInput {
  name: string;
  amount: number;
  category: string;
  billingCycle: BillingCycle;
  startDate: string;
  /** Optional "till date" — normalized to null in storage (Firestore rejects undefined). */
  endDate?: string | null;
}

export function addSubscription(uid: string, input: SubscriptionInput, source = "manual") {
  return addDoc(collection(db, "subscriptions"), {
    ...input,
    endDate: input.endDate ?? null,
    uid,
    source,
    nextDueDate: calculateNextDueDate(input.startDate, input.billingCycle),
    createdAt: serverTimestamp(),
  });
}

export function updateSubscription(id: string, input: SubscriptionInput) {
  return updateDoc(doc(db, "subscriptions", id), {
    ...input,
    endDate: input.endDate ?? null,
    nextDueDate: calculateNextDueDate(input.startDate, input.billingCycle),
  });
}

/** "Keep tracking" an ended subscription: clear its till date. */
export function clearEndDate(id: string) {
  return updateDoc(doc(db, "subscriptions", id), { endDate: null });
}

export function deleteSubscription(id: string) {
  return deleteDoc(doc(db, "subscriptions", id));
}

// ---------- Detected subscriptions (written by the backend scanner) ----------

export function useDetected(user: User | null) {
  const [detected, setDetected] = useState<DetectedSubscription[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "detected"),
      where("uid", "==", user.uid),
      where("status", "==", "pending"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setDetected(
          snap.docs.map((d) => ({ ...(d.data() as Omit<DetectedSubscription, "id">), id: d.id })),
        );
      },
      (err) => console.error("detected listener:", err),
    );
  }, [user]);

  return detected;
}

/**
 * Stores scan candidates from the backend as pending "detected" docs,
 * skipping anything the user already tracks or has already been shown.
 * Returns how many new candidates were stored. Dedupe policy (incl. why
 * demo leftovers must never block real findings) lives in planDedupe.
 */
export async function storeDetectedCandidates(
  uid: string,
  items: Array<Omit<DetectedSubscription, "id" | "uid" | "status" | "source">>,
  source: "gmail" | "plaid" | "demo",
): Promise<number> {
  const [subsSnap, detectedSnap] = await Promise.all([
    getDocs(query(collection(db, "subscriptions"), where("uid", "==", uid))),
    getDocs(query(collection(db, "detected"), where("uid", "==", uid))),
  ]);

  const plan = planDedupe(
    subsSnap.docs.map((d) => d.data().name as string),
    detectedSnap.docs.map((d) => ({
      id: d.id,
      name: d.data().name as string,
      source: (d.data().source as string) ?? "demo",
    })),
    source,
  );

  await Promise.all(plan.staleIds.map((id) => deleteDoc(doc(db, "detected", id))));

  let stored = 0;
  for (const item of items) {
    if (plan.blockedNames.has(item.name.toLowerCase())) continue;
    await addDoc(collection(db, "detected"), {
      ...item,
      uid,
      status: "pending",
      source,
      createdAt: serverTimestamp(),
    });
    stored++;
  }
  return stored;
}

export async function approveDetected(det: DetectedSubscription) {
  await addSubscription(
    det.uid,
    {
      name: det.name,
      amount: det.amount,
      category: det.category || "Other",
      billingCycle: det.billingCycle,
      startDate: det.lastChargeDate,
    },
    det.source,
  );
  await updateDoc(doc(db, "detected", det.id), { status: "approved" });
}

export function dismissDetected(id: string) {
  return updateDoc(doc(db, "detected", id), { status: "dismissed" });
}

// ---------- User settings ----------

export function useUserSettings(user: User | null) {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const data = (snap.data() ?? {}) as Partial<UserSettings>;
        setSettings({ reminderDays: 3, ...data });
      },
      (err) => console.error("settings listener:", err),
    );
  }, [user]);

  return settings;
}

export function saveUserSettings(uid: string, patch: Partial<UserSettings>) {
  return setDoc(doc(db, "users", uid), patch, { merge: true });
}
