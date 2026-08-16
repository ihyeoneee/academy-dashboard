/* ============================================================
   helpers.js — small shared utilities used by both the
   instructor dashboard (app.js) and the student view (student-app.js)
   ============================================================ */

const ATTEND_STATUSES = ["출석", "지각", "조퇴", "결석"];
const HOMEWORK_STATUSES = ["완료", "부분완료", "미완료"];

function statusClass(status) {
  return (
    {
      출석: "pill-good",
      완료: "pill-good",
      지각: "pill-warning",
      부분완료: "pill-warning",
      조퇴: "pill-serious",
      결석: "pill-critical",
      미완료: "pill-critical",
    }[status] || "pill-muted"
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function emptyState(msg) {
  return `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
