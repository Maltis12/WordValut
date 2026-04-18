// =============================================
// WORDVAULT — daily.js
// Klistra in dina Supabase-uppgifter:
// =============================================
const SUPABASE_URL = "https://phqoafevszhkuxhfjdqi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocW9hZmV2c3poa3V4aGZqZHFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTgwMzcsImV4cCI6MjA5MTY5NDAzN30.xrvR8jFxpJ9nzuhXMgxyJgKnZC_jhg6MQ6ddZSmpOJc";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let wordLength = 0;
let alreadySolved = false;

// =============================================
// Init
// =============================================
document.addEventListener("DOMContentLoaded", async () => {
  const saved = localStorage.getItem("wv_user");
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch {}
  }

  updateAuthUI();
  await loadChallenge();

  document.getElementById("guessInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
});

// =============================================
// Auth UI
// =============================================
function updateAuthUI() {
  const area = document.getElementById("authArea");
  if (currentUser) {
    area.innerHTML = `<span class="user-name">👤 ${escapeHtml(currentUser.username)}</span>`;
  }
}

// =============================================
// Load challenge
// =============================================
async function loadChallenge() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric"
  });
  document.getElementById("dateLabel").textContent = today;

  const { data, error } = await db.rpc("get_daily_hint");

  document.getElementById("loadingCard").style.display = "none";

  if (error || !data) {
    document.getElementById("noChallenge").style.display = "block";
    return;
  }

  wordLength = data.length;

  document.getElementById("hintLetter").textContent = data.first_letter;
  document.getElementById("hintLength").textContent = data.length;
  document.getElementById("hintSolved").textContent = data.solved_count;

  renderBoxes(data.length, data.first_letter);

  // Check if already solved today
  const solvedKey = `wv_daily_${data.date}`;
  const localSolved = localStorage.getItem(solvedKey);

  if (localSolved) {
    showSolved(localSolved);
    return;
  }

  document.getElementById("challengeCard").style.display = "block";

  if (!currentUser) {
    document.getElementById("guestNotice").style.display = "block";
  }
}

// =============================================
// Letter boxes
// =============================================
function renderBoxes(length, firstLetter) {
  const wrap = document.getElementById("letterBoxes");
  wrap.innerHTML = Array.from({ length }, (_, i) =>
    `<div class="dc-box ${i === 0 ? "dc-known" : ""}" id="box-${i}">${i === 0 ? firstLetter.toUpperCase() : "_"}</div>`
  ).join("");
}

function updateBoxes(guess) {
  for (let i = 1; i < wordLength; i++) {
    const box = document.getElementById(`box-${i}`);
    if (!box) continue;
    if (guess[i]) {
      box.textContent = guess[i].toUpperCase();
      box.classList.add("dc-filled");
    } else {
      box.textContent = "_";
      box.classList.remove("dc-filled");
    }
  }
}

// =============================================
// Submit guess
// =============================================
async function submitGuess() {
  if (alreadySolved) return;

  const input = document.getElementById("guessInput");
  const btn = document.getElementById("guessBtn");
  const guess = input.value.trim().toLowerCase();

  if (!guess) return;

  if (!/^[a-z]+$/.test(guess)) {
    showMsg("error", "Only letters please.");
    return;
  }

  if (guess.length !== wordLength) {
    showMsg("error", `The word has ${wordLength} letters — your guess has ${guess.length}.`);
    return;
  }

  btn.disabled = true;

  const { data, error } = await db.rpc("guess_daily", {
    p_guess: guess,
    p_profile_id: currentUser ? currentUser.id : null
  });

  btn.disabled = false;

  if (error || !data) {
    showMsg("error", "Something went wrong. Try again.");
    return;
  }

  if (data.error === "already_solved") {
    showSolved(guess);
    return;
  }

  if (data.error) {
    showMsg("error", data.error);
    return;
  }

  if (data.correct) {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`wv_daily_${today}`, data.word);
    alreadySolved = true;
    await addDailyTrophy(data.word);
    showSolved(data.word);
  } else {
    showMsg("wrong", "Not quite — keep guessing!");
    updateBoxes(guess);
    input.value = "";
    input.focus();
  }
}

// =============================================
// Add daily trophy
// =============================================
async function addDailyTrophy(word) {
  const trophyWord = `⭐ ${word}`;

  if (currentUser) {
    await db.rpc("add_trophy", {
      p_profile_id: currentUser.id,
      p_word: trophyWord
    });
  } else {
    const local = JSON.parse(localStorage.getItem("wv_trophies") || "[]");
    if (!local.find(t => t.word === trophyWord)) {
      local.unshift({
        word: trophyWord,
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      });
      localStorage.setItem("wv_trophies", JSON.stringify(local));
    }
  }
}

// =============================================
// Show solved
// =============================================
function showSolved(word) {
  alreadySolved = true;
  document.getElementById("challengeCard").style.display = "none";
  document.getElementById("solvedWord").textContent = word.replace("⭐ ", "").toUpperCase();
  document.getElementById("solvedCard").style.display = "block";
}

function showMsg(type, msg) {
  document.getElementById("guessResult").innerHTML =
    `<div class="dc-msg ${type}">${escapeHtml(msg)}</div>`;
}

// =============================================
// Admin panel — view only
// =============================================
function openAdminModal() {
  document.getElementById("adminModal").classList.add("open");
  document.getElementById("adminResult").style.display = "none";
  document.getElementById("adminError").textContent = "";
}

function closeAdminModal() {
  document.getElementById("adminModal").classList.remove("open");
  document.getElementById("adminPassword").value = "";
}

async function viewDailyWord() {
  const password = document.getElementById("adminPassword").value;
  const errEl = document.getElementById("adminError");

  if (!password) { errEl.textContent = "Enter password."; return; }
  errEl.textContent = "Checking...";

  const { data, error } = await db.rpc("get_daily_admin", {
    p_admin_password: password
  });

  if (error || data?.error) {
    errEl.textContent = data?.error || "Something went wrong.";
    return;
  }

  errEl.textContent = "";
  const resultEl = document.getElementById("adminResult");
  resultEl.style.display = "block";
  resultEl.innerHTML = `
    <div class="ar-label">Today's word</div>
    <div class="ar-word">${escapeHtml(data.word.toUpperCase())}</div>
    <div class="ar-meta">${data.date} · ${data.solvers} solver${data.solvers !== 1 ? "s" : ""}</div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
