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

  // Set today's date as default in admin panel
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("adminDate").value = today;

  document.getElementById("guessInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
});

// =============================================
// Auth UI (simplified)
// =============================================
function updateAuthUI() {
  const area = document.getElementById("authArea");
  if (currentUser) {
    area.innerHTML = `
      <div class="user-info">
        <span class="user-name">👤 ${escapeHtml(currentUser.username)}</span>
        <a href="index.html" class="auth-btn secondary" style="text-decoration:none;padding:0.45rem 1rem;">← Back</a>
      </div>`;
  } else {
    area.innerHTML = `<a href="index.html" class="auth-btn" style="text-decoration:none;">← Back</a>`;
  }
}

// =============================================
// Load challenge
// =============================================
async function loadChallenge() {
  const { data, error } = await db.rpc("get_daily_hint");

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("dateLabel").textContent = today;

  if (error || !data) {
    document.getElementById("noChallenge").style.display = "block";
    return;
  }

  wordLength = data.length;

  document.getElementById("hintLetter").textContent = data.first_letter;
  document.getElementById("hintLength").textContent = data.length;
  document.getElementById("hintSolved").textContent = data.solved_count;
  renderLetterBoxes(data.length, data.first_letter);

  // Check if already solved today (local storage for guests, server for logged in)
  const solvedKey = `wv_daily_${data.date}`;
  const localSolved = localStorage.getItem(solvedKey);

  if (currentUser) {
    // Server check handled by guess function returning already_solved
  }

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
// Render letter boxes
// =============================================
function renderLetterBoxes(length, firstLetter) {
  const display = document.getElementById("letterDisplay");
  display.innerHTML = Array.from({ length }, (_, i) =>
    `<div class="letter-box ${i === 0 ? "known" : ""}">${i === 0 ? firstLetter.toUpperCase() : ""}</div>`
  ).join("");
}

function updateLetterBoxes(guess) {
  const display = document.getElementById("letterDisplay");
  const boxes = display.querySelectorAll(".letter-box");
  boxes.forEach((box, i) => {
    if (i === 0) return; // keep first letter
    box.textContent = guess[i] ? guess[i].toUpperCase() : "";
    box.classList.toggle("filled", !!guess[i]);
  });
}

// =============================================
// Submit guess
// =============================================
async function submitGuess() {
  if (alreadySolved) return;

  const input = document.getElementById("guessInput");
  const btn = document.getElementById("guessBtn");
  const resultEl = document.getElementById("guessResult");
  const guess = input.value.trim().toLowerCase();

  if (!guess) return;
  if (!/^[a-z]+$/.test(guess)) {
    showGuessMsg("error", "Only letters please.");
    return;
  }
  if (guess.length !== wordLength) {
    showGuessMsg("error", `The word has ${wordLength} letters.`);
    return;
  }

  btn.disabled = true;

  const { data, error } = await db.rpc("guess_daily", {
    p_guess: guess,
    p_profile_id: currentUser ? currentUser.id : null
  });

  btn.disabled = false;

  if (error || !data) {
    showGuessMsg("error", "Something went wrong. Try again.");
    return;
  }

  if (data.error === "already_solved") {
    showSolved(guess);
    return;
  }

  if (data.error) {
    showGuessMsg("error", data.error);
    return;
  }

  if (data.correct) {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`wv_daily_${today}`, data.word);
    alreadySolved = true;

    // Add trophy
    await addDailyTrophy(data.word);
    showSolved(data.word);
  } else {
    showGuessMsg("wrong", `Not quite — keep trying!`);
    updateLetterBoxes(guess);
    input.value = "";
    input.focus();
  }
}

// =============================================
// Add daily trophy (blue star style)
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
// Show solved state
// =============================================
function showSolved(word) {
  alreadySolved = true;
  document.getElementById("challengeCard").style.display = "none";
  document.getElementById("guestNotice").style.display = "none";
  document.getElementById("solvedWord").textContent = word.replace("⭐ ", "");
  document.getElementById("solvedCard").style.display = "block";
}

function showGuessMsg(type, msg) {
  const el = document.getElementById("guessResult");
  el.innerHTML = `<div class="guess-msg ${type}">${escapeHtml(msg)}</div>`;
}

// =============================================
// Admin panel
// =============================================
function openAdminModal() {
  document.getElementById("adminModal").classList.add("open");
}

function closeAdminModal() {
  document.getElementById("adminModal").classList.remove("open");
  document.getElementById("adminError").textContent = "";
}

async function setDailyWord() {
  const password = document.getElementById("adminPassword").value;
  const word = document.getElementById("adminWord").value.trim().toLowerCase();
  const date = document.getElementById("adminDate").value;
  const errEl = document.getElementById("adminError");

  if (!password || !word || !date) {
    errEl.textContent = "Fill in all fields.";
    return;
  }

  errEl.textContent = "Setting word...";

  const { data, error } = await db.rpc("set_daily_word", {
    p_word: word,
    p_admin_password: password,
    p_date: date
  });

  if (error || data?.error) {
    errEl.textContent = data?.error || "Something went wrong.";
    return;
  }

  errEl.style.color = "var(--gold)";
  errEl.textContent = `✓ Set! Word "${data.word}" for ${data.date}`;

  document.getElementById("adminPassword").value = "";
  document.getElementById("adminWord").value = "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
