/* ============================================================
   student-app.js — read-only per-student view.
   Access is by unguessable link (?id=<studentId>), no login.
   Shows only that one student's own records — never the roster,
   phone numbers, other students' data, or the instructor's
   private 상담메모 notes.

   Polls the server every 20s and re-renders so edits the
   instructor makes show up here without the student needing to
   manually refresh (instructor + student pages stay in sync).
   ============================================================ */

const REFRESH_INTERVAL_MS = 20000;

document.addEventListener("DOMContentLoaded", async () => {
  await Store.ready;
  renderFromStudentId();

  document.addEventListener("store:refreshed", renderFromStudentId);
  setInterval(() => Store.refresh(), REFRESH_INTERVAL_MS);
});

function renderFromStudentId() {
  const studentId = new URLSearchParams(location.search).get("id");
  const found = Store.findStudentGlobally(studentId);

  if (!found) {
    renderNotFound();
    return;
  }

  const scrollY = window.scrollY;
  renderStudentView(found.semester, found.classInfo, found.student);
  window.scrollTo(0, scrollY);
}

function renderNotFound() {
  document.getElementById("content").innerHTML = "";
  document.getElementById("content").appendChild(
    el(`<section class="panel">
      ${emptyState("링크가 올바르지 않거나 만료되었습니다. 담당 선생님께 새 링크를 요청해주세요.")}
    </section>`)
  );
}

function renderStudentView(semester, classInfo, student) {
  document.getElementById("student-title").textContent = `${student.name || "학생"} 님의 학습 현황 (${semester.name} · ${classInfo.name})`;

  const semesterId = semester.id;
  const classId = classInfo.id;

  const root = document.getElementById("content");
  root.innerHTML = "";
  root.appendChild(renderAnnouncementsPanel(semesterId, classId));
  root.appendChild(renderMaterialsPanel(semesterId, classId));
  root.appendChild(renderAttendancePanel(semesterId, classId, student.id));
  root.appendChild(renderHomeworkPanel(semesterId, classId, student.id));
  root.appendChild(renderGradesPanel(semesterId, classId, student));
}

/* ---------------- 공지사항 ---------------- */

function renderAnnouncementsPanel(semesterId, classId) {
  const items = [...Store.announcements(semesterId, classId)].sort((a, b) => (a.date < b.date ? 1 : -1));
  const panel = el(`<section class="panel">
    <div class="panel-header"><h2>공지사항</h2></div>
    ${
      items.length === 0
        ? emptyState("등록된 공지사항이 없습니다.")
        : `<div class="stacked-list">
            ${items
              .map(
                (a) => `<div class="stacked-item">
                  <div class="stacked-item-header">
                    <span class="stacked-item-title">${escapeHtml(a.title)}</span>
                    <span class="stacked-item-date">${a.date}</span>
                  </div>
                  ${a.body ? `<div class="stacked-item-body">${escapeHtml(a.body)}</div>` : ""}
                </div>`
              )
              .join("")}
          </div>`
    }
  </section>`);
  return panel;
}

/* ---------------- 과제자료실 ---------------- */

function renderMaterialsPanel(semesterId, classId) {
  const items = [...Store.materials(semesterId, classId)].sort((a, b) => (a.date < b.date ? 1 : -1));
  const panel = el(`<section class="panel">
    <div class="panel-header"><h2>과제자료실</h2></div>
    ${
      items.length === 0
        ? emptyState("등록된 과제자료가 없습니다.")
        : `<div class="stacked-list">
            ${items
              .map((m) => {
                const href = `/data/uploads/${semesterId}/${classId}/${m.id}/${encodeURIComponent(m.fileName)}`;
                return `<div class="stacked-item">
                  <div class="stacked-item-header">
                    <span class="stacked-item-title">${escapeHtml(m.title)}</span>
                    <span class="stacked-item-date">${m.date} · ${formatBytes(m.size)}</span>
                    <a class="btn btn-primary" href="${href}" target="_blank" rel="noopener">다운로드</a>
                  </div>
                </div>`;
              })
              .join("")}
          </div>`
    }
  </section>`);
  return panel;
}

/* ---------------- 출결 ---------------- */

function renderAttendancePanel(semesterId, classId, studentId) {
  const mine = Store.attendance(semesterId, classId)
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const count = (st) => mine.filter((r) => r.status === st).length;
  const total = mine.length;
  const present = count("출석");
  const rate = total ? Math.round((present / total) * 100) : 0;

  const panel = el(`<section class="panel">
    <div class="panel-header"><h2>출결현황</h2></div>
    ${
      total === 0
        ? emptyState("아직 출결 기록이 없습니다.")
        : `<div class="stat-row">
            <div class="stat-tile"><div class="stat-value">${rate}%</div><div class="stat-label">출석률</div></div>
            <div class="stat-tile"><div class="stat-value">${present}</div><div class="stat-label">출석</div></div>
            <div class="stat-tile"><div class="stat-value">${count("지각")}</div><div class="stat-label">지각</div></div>
            <div class="stat-tile"><div class="stat-value">${count("조퇴")}</div><div class="stat-label">조퇴</div></div>
            <div class="stat-tile"><div class="stat-value">${count("결석")}</div><div class="stat-label">결석</div></div>
          </div>
          <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>날짜</th><th>상태</th><th>사유</th></tr></thead>
            <tbody>
              ${mine
                .slice(0, 30)
                .map(
                  (r) =>
                    `<tr><td>${r.date}</td><td><span class="pill ${statusClass(r.status)}">${r.status}</span></td><td>${escapeHtml(
                      r.note || ""
                    )}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
          </div>`
    }
  </section>`);
  return panel;
}

/* ---------------- 숙제 ---------------- */

function renderHomeworkPanel(semesterId, classId, studentId) {
  const mine = Store.homework(semesterId, classId)
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const panel = el(`<section class="panel">
    <div class="panel-header"><h2>숙제현황</h2></div>
    ${
      mine.length === 0
        ? emptyState("아직 숙제 기록이 없습니다.")
        : `<div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>날짜</th><th>상태</th><th>선생님 메모</th></tr></thead>
            <tbody>
              ${mine
                .slice(0, 30)
                .map(
                  (r) =>
                    `<tr><td>${r.date}</td><td><span class="pill ${statusClass(r.status)}">${r.status}</span></td><td>${escapeHtml(
                      r.note || ""
                    )}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
          </div>`
    }
  </section>`);
  return panel;
}

/* ---------------- 성적 ---------------- */

function renderGradesPanel(semesterId, classId, student) {
  const allGrades = Store.grades(semesterId, classId);
  const mine = allGrades.filter((g) => g.studentId === student.id);
  const subjects = Array.from(new Set(mine.map((g) => g.subject).filter(Boolean))).sort();

  const panel = el(`<section class="panel">
    <div class="panel-header">
      <h2>성적변화 추이</h2>
      ${
        subjects.length
          ? `<label class="field-inline">과목 <select id="s-subject-filter"><option value="">전체</option>${subjects
              .map((sub) => `<option value="${escapeAttr(sub)}">${escapeHtml(sub)}</option>`)
              .join("")}</select></label>`
          : ""
      }
    </div>
    ${mine.length === 0 ? emptyState("아직 성적 기록이 없습니다.") : `<label class="field-inline"><input type="checkbox" id="s-avg-toggle" /> 반 평균과 비교</label>
    <div id="s-grade-chart" class="chart-box"></div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>날짜</th><th>과목</th><th>시험명</th><th>점수</th><th>만점</th></tr></thead>
      <tbody>
        ${[...mine]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((g) => `<tr><td>${g.date}</td><td>${escapeHtml(g.subject)}</td><td>${escapeHtml(g.testName || "")}</td><td>${g.score}</td><td>${g.maxScore}</td></tr>`)
          .join("")}
      </tbody>
    </table>
    </div>`}
  </section>`);

  if (mine.length > 0) {
    const subjectFilter = panel.querySelector("#s-subject-filter");
    const avgToggle = panel.querySelector("#s-avg-toggle");
    const chartBox = panel.querySelector("#s-grade-chart");

    function draw() {
      const subject = subjectFilter ? subjectFilter.value : "";
      const filteredMine = mine.filter((g) => !subject || g.subject === subject);
      const categories = Array.from(new Set(filteredMine.map((g) => g.date))).sort();

      const values = categories.map((date) => {
        const rows = filteredMine.filter((g) => g.date === date);
        if (rows.length === 0) return null;
        return rows.reduce((sum, r) => sum + (r.score / (r.maxScore || 1)) * 100, 0) / rows.length;
      });
      const points = categories.map((date) => {
        const row = filteredMine.find((g) => g.date === date);
        return row ? { score: row.score, maxScore: row.maxScore } : null;
      });

      const series = [{ label: student.name || "내 점수", values, points }];

      if (avgToggle.checked) {
        const filteredAll = allGrades.filter((g) => !subject || g.subject === subject);
        const avgValues = categories.map((date) => {
          const rows = filteredAll.filter((g) => g.date === date);
          if (rows.length === 0) return null;
          return rows.reduce((sum, r) => sum + (r.score / (r.maxScore || 1)) * 100, 0) / rows.length;
        });
        series.push({ label: "반 평균", values: avgValues, color: "var(--text-muted)", points: [] });
      }

      renderLineChart(chartBox, { categories, series, yLabel: "성취율(%)", yDomain: [0, 100] });
    }

    if (subjectFilter) subjectFilter.addEventListener("change", draw);
    avgToggle.addEventListener("change", draw);
    draw();
  }

  return panel;
}
