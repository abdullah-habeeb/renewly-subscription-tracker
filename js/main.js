// js/main.js

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, where, doc, deleteDoc, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { auth, db, functions } from './firebase-config.js';

let currentUser = null;
let costChart;
let allSubscriptions = [];

// --- Get HTML Elements ---
const appHeader = document.getElementById('app-header');
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const addSubForm = document.getElementById('add-sub-form');
const totalMonthlyEl = document.getElementById('total-monthly');
const totalSubsEl = document.getElementById('total-subs');
const nextDueEl = document.getElementById('next-due');
const subscriptionListEl = document.getElementById('subscription-list');
const costChartCanvas = document.getElementById('cost-chart');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const closeModalBtn = document.getElementById('close-modal-btn');
const serverReportPanel = document.getElementById('server-report-panel');
const serverMonthlyEl = document.getElementById('server-monthly');
const serverYearlyEl = document.getElementById('server-yearly');
const serverTimestampEl = document.getElementById('server-timestamp');
const serverUpcomingEl = document.getElementById('server-upcoming');
const refreshReportBtn = document.getElementById('refresh-report-btn');

// --- Cloud Function reference ---
const getSpendingReport = httpsCallable(functions, 'getSpendingReport');

// --- Auth State Listener ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    appHeader.classList.remove('hidden');
    userEmailSpan.textContent = user.email;
    listenForSubscriptions(user);
    fetchServerReport(); // Fetch server-side analytics on login
  } else {
    currentUser = null;
    window.location.href = 'login.html';
  }
});

// --- Firestore Real-Time Listener (Read) ---
function listenForSubscriptions(user) {
  const subsCollection = collection(db, 'subscriptions');
  const q = query(subsCollection, where("uid", "==", user.uid), orderBy("nextDueDate"));

  onSnapshot(q, (snapshot) => {
    allSubscriptions = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    updateUI(allSubscriptions);
  }, (error) => {
    console.error("Firestore listener error:", error);
    alert("Error loading subscriptions. Check console.");
  });
}

// --- Server-Side Analytics (Express API call via Nginx proxy) ---
async function fetchServerReport() {
  if (!serverReportPanel) return;
  serverReportPanel.classList.remove('report-error');
  serverTimestampEl.textContent = 'Fetching from server…';

  try {
    // Call backend through Nginx proxy (relative path)
    const response = await fetch('/api/spending-report', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.uid, // Pass user ID from Firebase auth
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const report = await response.json();

    serverMonthlyEl.textContent = `₹${report.monthlyTotal.toFixed(2)}`;
    serverYearlyEl.textContent = `₹${report.yearlyEquivalent.toFixed(2)}`;

    const ts = new Date(report.generatedAt);
    serverTimestampEl.textContent = `Generated at ${ts.toLocaleTimeString('en-IN')} on ${ts.toLocaleDateString('en-IN')}`;

    // Upcoming dues list
    serverUpcomingEl.innerHTML = '';
    if (report.upcomingDues.length === 0) {
      serverUpcomingEl.innerHTML = '<li>No upcoming dues.</li>';
    } else {
      report.upcomingDues.forEach(due => {
        const li = document.createElement('li');
        const dueDate = new Date(due.nextDueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        li.innerHTML = `<span>${due.name}</span><span>₹${Number(due.amount).toFixed(2)} — ${dueDate}</span>`;
        serverUpcomingEl.appendChild(li);
      });
    }
  } catch (err) {
    console.error("Server API error:", err);
    serverTimestampEl.textContent = 'Could not reach server. Make sure backend is running.';
    serverReportPanel.classList.add('report-error');
  }
}

// --- Event Listeners ---
addSubForm.addEventListener('submit', handleAddSubscription);
logoutBtn.addEventListener('click', () => signOut(auth));
editForm.addEventListener('submit', handleEditSubmit);
closeModalBtn.addEventListener('click', closeEditModal);
refreshReportBtn.addEventListener('click', fetchServerReport);

// --- Create (Add Subscription) ---
async function handleAddSubscription(e) {
  e.preventDefault();

  if (!currentUser) {
    alert("Error: Not logged in. Please log out and back in.");
    return;
  }

  const subName = document.getElementById('sub-name').value;
  const subAmount = document.getElementById('sub-amount').value;
  const subCategory = document.getElementById('sub-category').value;
  const subCycle = document.getElementById('sub-cycle').value;
  const subDate = document.getElementById('sub-date').value;

  if (!subName || !subAmount || !subCategory || !subDate) {
    alert('Please fill out all fields.');
    return;
  }

  const newSubscription = {
    name: subName,
    amount: +subAmount,
    category: subCategory,
    billingCycle: subCycle,
    startDate: subDate,
    nextDueDate: calculateNextDueDate(subDate, subCycle),
    uid: currentUser.uid
  };

  try {
    await addDoc(collection(db, 'subscriptions'), newSubscription);
    addSubForm.reset();
    // Refresh server report after adding so the panel stays in sync
    fetchServerReport();
  } catch (error) {
    console.error("Error adding subscription:", error);
    alert("Failed to add subscription. Check the console for details.");
  }
}

// --- Supporting Functions ---

function calculateNextDueDate(startDate, cycle) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let nextDate = new Date(startDate);
  while (nextDate < today) {
    if (cycle === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    else if (cycle === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
  }
  return nextDate.toISOString().split('T')[0];
}

function updateUI(subscriptions = []) {
  updateSubscriptionList(subscriptions);
  updateSummary(subscriptions);
  updateChart(subscriptions);
}

function updateSubscriptionList(subscriptions) {
  subscriptionListEl.innerHTML = '';
  subscriptions.forEach(sub => {
    const item = document.createElement('li');
    const formattedDate = new Date(sub.nextDueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    item.innerHTML = `
      <div class="sub-details">
        <strong>${sub.name}</strong>
        <small>${sub.category}</small>
      </div>
      <div class="sub-billing">
        <strong>₹${Math.abs(sub.amount).toFixed(2)}</strong>
        <small>Next: ${formattedDate}</small>
      </div>`;
    const btnContainer = document.createElement('div');
    const editBtn = document.createElement('button');
    editBtn.classList.add('edit-btn');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(sub));
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = 'x';
    deleteBtn.addEventListener('click', () => removeSubscription(sub.id));
    btnContainer.appendChild(editBtn);
    btnContainer.appendChild(deleteBtn);
    item.appendChild(btnContainer);
    subscriptionListEl.appendChild(item);
  });
}

function updateSummary(subscriptions) {
  const monthlyTotal = subscriptions.reduce((total, sub) =>
    sub.billingCycle === 'monthly' ? total + sub.amount : total + (sub.amount / 12), 0);
  totalMonthlyEl.textContent = `₹${monthlyTotal.toFixed(2)}`;
  totalSubsEl.textContent = subscriptions.length;
  if (subscriptions.length > 0) {
    const nextDueDate = new Date(subscriptions[0].nextDueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    nextDueEl.textContent = `${subscriptions[0].name} (${nextDueDate})`;
  } else {
    nextDueEl.textContent = '--';
  }
}

function updateChart(subscriptions) {
  const ctx = costChartCanvas.getContext('2d');
  const categoryCosts = subscriptions.reduce((acc, sub) => {
    const cost = sub.billingCycle === 'monthly' ? sub.amount : sub.amount / 12;
    acc[sub.category] = (acc[sub.category] || 0) + cost;
    return acc;
  }, {});
  const labels = Object.keys(categoryCosts);
  const data = Object.values(categoryCosts);
  if (costChart) { costChart.destroy(); }
  costChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        label: 'Cost per month',
        data,
        backgroundColor: generateColors(labels.length),
        borderWidth: 1
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function generateColors(numColors) {
  return Array.from({ length: numColors }, (_, i) => `hsl(${(360 / numColors) * i}, 70%, 60%)`);
}

// --- Delete ---
function removeSubscription(id) {
  deleteDoc(doc(db, 'subscriptions', id)).then(() => fetchServerReport());
}

// --- Edit Modal ---
function openEditModal(subscription) {
  editModal.classList.remove('hidden');
  document.getElementById('edit-id').value = subscription.id;
  document.getElementById('edit-name').value = subscription.name;
  document.getElementById('edit-amount').value = subscription.amount;
  document.getElementById('edit-category').value = subscription.category;
  document.getElementById('edit-date').value = subscription.startDate;
}

function closeEditModal() {
  editModal.classList.add('hidden');
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const subId = document.getElementById('edit-id').value;
  if (!subId) return;
  const originalSub = allSubscriptions.find(sub => sub.id === subId);
  if (!originalSub) return;
  const startDate = document.getElementById('edit-date').value;
  const updatedSubData = {
    name: document.getElementById('edit-name').value,
    amount: +document.getElementById('edit-amount').value,
    category: document.getElementById('edit-category').value,
    startDate,
    nextDueDate: calculateNextDueDate(startDate, originalSub.billingCycle)
  };
  try {
    await updateDoc(doc(db, 'subscriptions', subId), updatedSubData);
    closeEditModal();
    fetchServerReport(); // Refresh server analytics after edit
  } catch (error) {
    console.error("Error updating subscription:", error);
    alert("Failed to update subscription. Check console for details.");
  }
}