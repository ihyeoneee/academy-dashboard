/* ============================================================
   app.js — UI rendering & event wiring
   ============================================================ */

const state = {
  classId: "c1",
  tab: "roster",
};

const TABS = [
  { id: "roster", label: "학생정보" },
  { id: "attendance", label: "출결현황" },
  { id: "homework", label: "숙제현황" },
  { id: "materials", label: "공지·과제자료" },
  { id: "grades", label: "성적추이" },
  { id: "import", label: "데이터 가져오기" },
];

function init() {
  renderClassTabs();
  renderSubTabs();
  renderContent();
  wireHeaderActions();
  wireSaveStatus();
}

function wireSaveStatus() {
  const banner = document.getElementById("save-status");
  document.addEventListener("store:save-error", () => {
    banner.textContent = "저장 서버에 연결할 수 없습니다. 방금 입력한 내용이 저장되지 않았을 수 있어요 — '시작하기.bat'으로 실행 중인지 확인해주세요.";
    banner.hidden = false;
  });
  document.addEventListener("store:save-ok", () => {
    banner.hidden = true;
  });
}

function renderClassTabs() {
  const nav = document.getElementById("class-tabs");
  nav.innerHTML = "";
  Store.all.classes.forEach((c) => {
    const btn = el(`<button class="tab-btn ${c.id === state.classId ? "active" : ""}" data-class="${c.id}">${c.name}</button>`);
    btn.addEventListener("click", () => {
      state.classId = c.id;
      renderClassTabs();
      renderContent();
    });
    btn.addEventListener("dblclick", () => {
      const name = prompt("반 이름을 입력하세요.", c.name);
      if (name && name.trim()) {
        Store.renameClass(c.id, name.trim());
        renderClassTabs();
      }
    });
    nav.appendChild(btn);
  });
}

function renderSubTabs() {
  const nav = document.getElementById("sub-tabs");
  nav.innerHTML = "";
  TABS.forEach((t) => {
    const btn = el(`<button class="subtab-btn ${t.id === state.tab ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`);
    btn.addEventListener("click", () => {
      state.tab = t.id;
      renderSubTabs();
      renderContent();
    });
    nav.appendChild(btn);
  });
}

function renderContent() {
  const root = document.getElementById("content");
  root.innerHTML = "";
  const renderers = {
    roster: renderRoster,
    attendance: renderAttendance,
    homework: renderHomework,
    materials: renderMaterials,
    grades: renderGrades,
    import: renderImport,
  };
  renderers[state.tab](root, state.classId);
}

/* ---------------- 학생정보 (roster + contacts) ---------------- */

function renderRoster(root, classId) {
  const students = Store.students(classId);
  const wrap = el(`<section class="panel">
    <div class="panel-header">
      <h2>학생명단 &amp; 연락처</h2>
      <button class="btn btn-primary" id="add-student">+ 학생 추가</button>
    </div>
    ${students.length === 0 ? emptyState("등록된 학생이 없습니다. '학생 추가' 또는 '데이터 가져오기'로 시작하세요.") : ""}
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>이름</th><th>학생 연락처</th><th>학부모 연락처</th><th>학부모 관계</th><th>상태</th><th>학생용 화면</th><th></th>
      </tr></thead>
      <tbody id="roster-body"></tbody>
    </table>
    </div>
  </section>`);
  root.appendChild(wrap);

  const body = wrap.querySelector("#roster-body");
  students.forEach((s) => {
    const flags = Store.attentionFlags(classId, s.id);
    const row = el(`<tr>
      <td>
        <input class="cell-input" data-field="name" value="${escapeAttr(s.name)}" placeholder="이름" />
        ${flags.length ? `<div class="attention-flags">${flags.map((f) => `<span class="attention-badge">⚠ ${escapeHtml(f)}</span>`).join("")}</div>` : ""}
      </td>
      <td><input class="cell-input" data-field="studentPhone" value="${escapeAttr(s.studentPhone)}" placeholder="010-0000-0000" /></td>
      <td><input class="cell-input" data-field="parentPhone" value="${escapeAttr(s.parentPhone)}" placeholder="010-0000-0000" /></td>
      <td><input class="cell-input" data-field="parentRelation" value="${escapeAttr(s.parentRelation)}" placeholder="모/부" /></td>
      <td>
        <select class="cell-input" data-field="status">
          ${["재원", "휴원", "퇴원"].map((v) => `<option value="${v}" ${s.status === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </td>
      <td class="student-link-cell">
        <button class="btn btn-ghost" data-copy-link>링크 복사</button>
        <button class="btn btn-ghost" data-preview-link>미리보기</button>
      </td>
      <td><button class="btn btn-ghost btn-danger" data-del>삭제</button></td>
    </tr>`);
    row.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        Store.updateStudent(classId, s.id, { [input.dataset.field]: input.value });
      });
    });
    const studentUrl = `${location.origin}/student.html?id=${s.id}`;
    const copyBtn = row.querySelector("[data-copy-link]");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(studentUrl);
        const original = copyBtn.textContent;
        copyBtn.textContent = "복사됨!";
        setTimeout(() => (copyBtn.textContent = original), 1200);
      } catch (e) {
        prompt("아래 주소를 복사하세요:", studentUrl);
      }
    });
    row.querySelector("[data-preview-link]").addEventListener("click", () => {
      window.open(studentUrl, "_blank");
    });
    row.querySelector("[data-del]").addEventListener("click", () => {
      if (confirm(`${s.name || "이 학생"}을(를) 삭제할까요? 관련 출결/숙제/성적 기록도 함께 삭제됩니다.`)) {
        Store.removeStudent(classId, s.id);
        renderContent();
      }
    });
    body.appendChild(row);
  });

  wrap.querySelector("#add-student").addEventListener("click", () => {
    Store.addStudent(classId, {});
    renderContent();
  });
}

/* ---------------- 출결현황 ---------------- */

function renderAttendance(root, classId) {
  const students = Store.students(classId);
  const records = Store.attendance(classId);
  const wrap = el(`<section class="panel">
    <div class="panel-header">
      <h2>출결현황</h2>
      <label class="field-inline">날짜 <input type="date" id="att-date" value="${todayISO()}" /></label>
    </div>
    ${students.length === 0 ? emptyState("학생을 먼저 등록해주세요.") : ""}
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>이름</th><th>상태</th><th style="width:24%">사유(선택)</th></tr></thead>
      <tbody id="att-body"></tbody>
    </table>
    </div>
    <h3 class="sub-heading">최근 기록</h3>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>날짜</th><th>이름</th><th>상태</th><th>사유</th></tr></thead>
      <tbody id="att-log"></tbody>
    </table>
    </div>
    <h3 class="sub-heading">최근 출석 요약</h3>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>이름</th><th>출석</th><th>지각</th><th>조퇴</th><th>결석</th><th>출석률</th></tr></thead>
      <tbody id="att-summary"></tbody>
    </table>
    </div>
  </section>`);
  root.appendChild(wrap);

  const dateInput = wrap.querySelector("#att-date");
  const body = wrap.querySelector("#att-body");

  function drawDay() {
    body.innerHTML = "";
    const date = dateInput.value;
    students.forEach((s) => {
      const rec = records.find((r) => r.studentId === s.id && r.date === date);
      const row = el(
        `<tr><td>${escapeHtml(s.name) || "(이름 없음)"}</td><td class="status-cell"></td><td></td></tr>`
      );
      const cell = row.querySelector(".status-cell");
      ATTEND_STATUSES.forEach((st) => {
        const btn = el(`<button class="pill-btn ${statusClass(st)} ${rec && rec.status === st ? "active" : ""}">${st}</button>`);
        btn.addEventListener("click", () => {
          Store.setAttendance(classId, s.id, date, st);
          drawDay();
          drawLog();
          drawSummary();
        });
        cell.appendChild(btn);
      });
      const noteInput = el(`<input class="cell-input" placeholder="예: 병원 방문" value="${escapeAttr(rec ? rec.note : "")}" />`);
      noteInput.addEventListener("change", () => {
        if (!rec) return; // no status set yet for this date — nothing to attach the note to
        Store.setAttendance(classId, s.id, date, rec.status, noteInput.value);
        drawLog();
      });
      row.children[2].appendChild(noteInput);
      body.appendChild(row);
    });
  }

  function drawLog() {
    const log = wrap.querySelector("#att-log");
    log.innerHTML = "";
    const nameOf = (id) => (students.find((s) => s.id === id) || {}).name || "(삭제됨)";
    const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
    sorted.forEach((r) => {
      log.appendChild(
        el(`<tr>
          <td>${r.date}</td><td>${escapeHtml(nameOf(r.studentId))}</td>
          <td><span class="pill ${statusClass(r.status)}">${r.status}</span></td>
          <td>${escapeHtml(r.note || "")}</td>
        </tr>`)
      );
    });
  }

  function drawSummary() {
    const summary = wrap.querySelector("#att-summary");
    summary.innerHTML = "";
    students.forEach((s) => {
      const mine = records.filter((r) => r.studentId === s.id);
      const count = (st) => mine.filter((r) => r.status === st).length;
      const total = mine.length;
      const present = count("출석");
      const rate = total ? Math.round((present / total) * 100) : 0;
      summary.appendChild(
        el(`<tr>
          <td>${escapeHtml(s.name) || "(이름 없음)"}</td>
          <td>${present}</td><td>${count("지각")}</td><td>${count("조퇴")}</td><td>${count("결석")}</td>
          <td>${total ? rate + "%" : "-"}</td>
        </tr>`)
      );
    });
  }

  dateInput.addEventListener("change", drawDay);
  drawDay();
  drawLog();
  drawSummary();
}

/* ---------------- 숙제현황 ---------------- */

function renderHomework(root, classId) {
  const students = Store.students(classId);
  const records = Store.homework(classId);
  const wrap = el(`<section class="panel">
    <div class="panel-header">
      <h2>숙제현황</h2>
      <label class="field-inline">날짜 <input type="date" id="hw-date" value="${todayISO()}" /></label>
    </div>
    ${students.length === 0 ? emptyState("학생을 먼저 등록해주세요.") : ""}
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th style="width:20%">이름</th><th style="width:20%">제출상태</th><th>특징 / 메모</th></tr></thead>
      <tbody id="hw-body"></tbody>
    </table>
    </div>
    <h3 class="sub-heading">최근 기록</h3>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>날짜</th><th>이름</th><th>상태</th><th>메모</th></tr></thead>
      <tbody id="hw-log"></tbody>
    </table>
    </div>
  </section>`);
  root.appendChild(wrap);

  const dateInput = wrap.querySelector("#hw-date");
  const body = wrap.querySelector("#hw-body");
  const log = wrap.querySelector("#hw-log");

  function drawDay() {
    body.innerHTML = "";
    const date = dateInput.value;
    students.forEach((s) => {
      const rec = records.find((r) => r.studentId === s.id && r.date === date);
      const row = el(`<tr>
        <td>${escapeHtml(s.name) || "(이름 없음)"}</td>
        <td>
          <select class="cell-input hw-status">
            ${HOMEWORK_STATUSES.map((v) => `<option value="${v}" ${rec && rec.status === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </td>
        <td><input class="cell-input hw-note" placeholder="예: 오답 많음 / 채점 완료 / 노트 깔끔" value="${escapeAttr(rec ? rec.note : "")}" /></td>
      </tr>`);
      const save = () => {
        const status = row.querySelector(".hw-status").value;
        const note = row.querySelector(".hw-note").value;
        Store.setHomework(classId, s.id, date, status, note);
        drawLog();
      };
      row.querySelector(".hw-status").addEventListener("change", save);
      row.querySelector(".hw-note").addEventListener("change", save);
      body.appendChild(row);
    });
  }

  function drawLog() {
    log.innerHTML = "";
    const nameOf = (id) => (students.find((s) => s.id === id) || {}).name || "(삭제됨)";
    const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
    sorted.forEach((r) => {
      log.appendChild(
        el(`<tr>
          <td>${r.date}</td><td>${escapeHtml(nameOf(r.studentId))}</td>
          <td><span class="pill ${statusClass(r.status)}">${r.status}</span></td>
          <td>${escapeHtml(r.note || "")}</td>
        </tr>`)
      );
    });
  }

  dateInput.addEventListener("change", drawDay);
  drawDay();
  drawLog();
}

/* ---------------- 성적추이 ---------------- */

function renderGrades(root, classId) {
  const students = Store.students(classId);
  const grades = Store.grades(classId);
  const subjects = Array.from(new Set(grades.map((g) => g.subject).filter(Boolean))).sort();

  const wrap = el(`<section class="panel">
    <div class="panel-header"><h2>성적변화 추이</h2></div>

    <details class="add-grade" open>
      <summary>성적 추가</summary>
      <form id="grade-form" class="inline-form">
        <input type="date" name="date" required value="${todayISO()}" />
        <select name="studentId" required>
          <option value="">학생 선택</option>
          ${students.map((s) => `<option value="${s.id}">${escapeHtml(s.name) || "(이름 없음)"}</option>`).join("")}
        </select>
        <input type="text" name="subject" placeholder="과목 (예: 수학)" required />
        <input type="text" name="testName" placeholder="시험명 (예: 3월 모의고사)" />
        <input type="number" name="score" placeholder="점수" required />
        <input type="number" name="maxScore" placeholder="만점" value="100" required />
        <button class="btn btn-primary" type="submit">추가</button>
      </form>
    </details>

    ${students.length === 0 ? emptyState("학생을 먼저 등록해주세요.") : ""}

    <div class="panel-header" style="margin-top:16px">
      <div class="field-inline">
        <label>과목 <select id="grade-subject-filter"><option value="">전체</option>${subjects
          .map((sub) => `<option value="${escapeAttr(sub)}">${escapeHtml(sub)}</option>`)
          .join("")}</select></label>
        <label><input type="checkbox" id="grade-avg-toggle" /> 반 평균 표시</label>
      </div>
    </div>
    <div id="grade-student-picker" class="chip-picker"></div>
    <div id="grade-chart" class="chart-box"></div>

    <h3 class="sub-heading">전체 성적 기록</h3>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>날짜</th><th>이름</th><th>과목</th><th>시험명</th><th>점수</th><th>만점</th><th></th></tr></thead>
      <tbody id="grade-log"></tbody>
    </table>
    </div>
  </section>`);
  root.appendChild(wrap);

  const picker = wrap.querySelector("#grade-student-picker");
  const selected = new Set(students.slice(0, 8).map((s) => s.id));

  students.forEach((s) => {
    const chip = el(`<label class="chip"><input type="checkbox" ${selected.has(s.id) ? "checked" : ""} value="${s.id}" />${
      escapeHtml(s.name) || "(이름 없음)"
    }</label>`);
    chip.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) selected.add(s.id);
      else selected.delete(s.id);
      draw();
    });
    picker.appendChild(chip);
  });

  const subjectFilter = wrap.querySelector("#grade-subject-filter");
  const avgToggle = wrap.querySelector("#grade-avg-toggle");
  const chartBox = wrap.querySelector("#grade-chart");

  function draw() {
    const subject = subjectFilter.value;
    const filtered = grades.filter((g) => !subject || g.subject === subject);
    const categories = Array.from(new Set(filtered.map((g) => g.date))).sort();

    const series = students
      .filter((s) => selected.has(s.id))
      .map((s) => {
        const mine = filtered.filter((g) => g.studentId === s.id);
        const values = categories.map((date) => {
          const rows = mine.filter((g) => g.date === date);
          if (rows.length === 0) return null;
          const pct = rows.reduce((sum, r) => sum + (r.score / (r.maxScore || 1)) * 100, 0) / rows.length;
          return pct;
        });
        const points = categories.map((date) => {
          const row = mine.find((g) => g.date === date);
          return row ? { score: row.score, maxScore: row.maxScore } : null;
        });
        return { label: s.name || "(이름 없음)", values, points };
      })
      .filter((s) => s.values.some((v) => v !== null));

    if (avgToggle.checked && categories.length) {
      const avgValues = categories.map((date) => {
        const rows = filtered.filter((g) => g.date === date);
        if (rows.length === 0) return null;
        return rows.reduce((sum, r) => sum + (r.score / (r.maxScore || 1)) * 100, 0) / rows.length;
      });
      series.push({ label: "반 평균", values: avgValues, color: "var(--text-muted)", points: [] });
    }

    renderLineChart(chartBox, { categories, series, yLabel: "성취율(%)", yDomain: [0, 100] });
  }

  subjectFilter.addEventListener("change", draw);
  avgToggle.addEventListener("change", draw);
  draw();

  wrap.querySelector("#grade-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Store.addGrade(classId, {
      studentId: fd.get("studentId"),
      date: fd.get("date"),
      subject: fd.get("subject"),
      testName: fd.get("testName"),
      score: Number(fd.get("score")),
      maxScore: Number(fd.get("maxScore")),
    });
    renderContent();
  });

  const logBody = wrap.querySelector("#grade-log");
  const nameOf = (id) => (students.find((s) => s.id === id) || {}).name || "(삭제됨)";
  [...grades]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .forEach((g) => {
      const row = el(`<tr>
        <td>${g.date}</td><td>${escapeHtml(nameOf(g.studentId))}</td><td>${escapeHtml(g.subject)}</td>
        <td>${escapeHtml(g.testName || "")}</td><td>${g.score}</td><td>${g.maxScore}</td>
        <td><button class="btn btn-ghost btn-danger" data-del>삭제</button></td>
      </tr>`);
      row.querySelector("[data-del]").addEventListener("click", () => {
        Store.removeGrade(classId, g.id);
        renderContent();
      });
      logBody.appendChild(row);
    });
}

/* ---------------- 공지·과제자료 ---------------- */

function renderMaterials(root, classId) {
  const announcements = Store.announcements(classId);
  const materials = Store.materials(classId);

  const wrap = el(`<section class="panel">
    <div class="panel-header"><h2>공지사항</h2></div>
    <form id="ann-form" class="inline-form">
      <input type="date" name="date" required value="${todayISO()}" />
      <input type="text" name="title" placeholder="제목 (예: 다음주 시험 안내)" required style="flex:1;min-width:160px" />
      <button class="btn btn-primary" type="submit">등록</button>
    </form>
    <textarea id="ann-body" class="cell-input" placeholder="내용 (선택)" rows="2" style="width:100%;margin-top:8px;border:1px solid var(--border);border-radius:6px;padding:8px"></textarea>
    <div id="ann-list" class="stacked-list"></div>
  </section>`);

  const filesWrap = el(`<section class="panel">
    <div class="panel-header"><h2>과제자료실</h2></div>
    <p class="hint-text">매주 과제 파일(PDF, 한글, 워드, 이미지 등)을 올리면 학생용 화면에서 바로 다운로드할 수 있습니다.</p>
    <form id="mat-form" class="inline-form">
      <input type="date" name="date" required value="${todayISO()}" />
      <input type="text" name="title" placeholder="제목 (예: 8월 3주차 수학 과제)" required style="flex:1;min-width:160px" />
      <input type="file" name="file" required />
      <button class="btn btn-primary" type="submit">업로드</button>
    </form>
    <div id="mat-progress"></div>
    <div id="mat-list" class="stacked-list"></div>
  </section>`);

  root.appendChild(wrap);
  root.appendChild(filesWrap);

  function drawAnnouncements() {
    const list = wrap.querySelector("#ann-list");
    list.innerHTML = "";
    if (announcements.length === 0) {
      list.appendChild(el(emptyState("등록된 공지사항이 없습니다.")));
      return;
    }
    [...announcements]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((a) => {
        const item = el(`<div class="stacked-item">
          <div class="stacked-item-header">
            <span class="stacked-item-title">${escapeHtml(a.title)}</span>
            <span class="stacked-item-date">${a.date}</span>
            <button class="btn btn-ghost btn-danger" data-del>삭제</button>
          </div>
          ${a.body ? `<div class="stacked-item-body">${escapeHtml(a.body)}</div>` : ""}
        </div>`);
        item.querySelector("[data-del]").addEventListener("click", () => {
          Store.removeAnnouncement(classId, a.id);
          renderContent();
        });
        list.appendChild(item);
      });
  }

  function drawMaterials() {
    const list = filesWrap.querySelector("#mat-list");
    list.innerHTML = "";
    if (materials.length === 0) {
      list.appendChild(el(emptyState("등록된 과제자료가 없습니다.")));
      return;
    }
    [...materials]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((m) => {
        const href = `/data/uploads/${classId}/${m.id}/${encodeURIComponent(m.fileName)}`;
        const item = el(`<div class="stacked-item">
          <div class="stacked-item-header">
            <span class="stacked-item-title">${escapeHtml(m.title)}</span>
            <span class="stacked-item-date">${m.date} · ${formatBytes(m.size)}</span>
            <a class="btn btn-ghost" href="${href}" target="_blank" rel="noopener">다운로드</a>
            <button class="btn btn-ghost btn-danger" data-del>삭제</button>
          </div>
        </div>`);
        item.querySelector("[data-del]").addEventListener("click", () => {
          if (confirm(`"${m.title}" 자료를 삭제할까요?`)) {
            Store.removeMaterial(classId, m.id);
            renderContent();
          }
        });
        list.appendChild(item);
      });
  }

  wrap.querySelector("#ann-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Store.addAnnouncement(classId, {
      date: fd.get("date"),
      title: fd.get("title"),
      body: wrap.querySelector("#ann-body").value,
    });
    renderContent();
  });

  filesWrap.querySelector("#mat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!file || !file.name) return;

    const progress = filesWrap.querySelector("#mat-progress");
    progress.textContent = "업로드 중...";
    const materialId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const params = new URLSearchParams({ classId, materialId, filename: file.name });
    try {
      const res = await fetch(`/api/upload?${params}`, { method: "POST", body: file });
      if (!res.ok) throw new Error("업로드 실패");
      const info = await res.json();
      Store.addMaterial(classId, {
        id: materialId,
        date: fd.get("date"),
        title: fd.get("title"),
        fileName: info.fileName,
        size: info.size,
      });
      progress.textContent = "";
      renderContent();
    } catch (err) {
      progress.textContent = "업로드에 실패했습니다. 서버(시작하기.bat)가 켜져 있는지 확인해주세요.";
    }
  });

  drawAnnouncements();
  drawMaterials();
}

/* ---------------- 데이터 가져오기 (CSV import) ---------------- */

const CSV_TEMPLATES = {
  students: { headers: ["이름", "학생연락처", "학부모연락처", "학부모관계", "상태"], example: ["홍길동", "010-1234-5678", "010-8765-4321", "모", "재원"] },
  attendance: { headers: ["날짜", "이름", "상태"], example: ["2026-08-16", "홍길동", "출석"] },
  homework: { headers: ["날짜", "이름", "상태", "메모"], example: ["2026-08-16", "홍길동", "완료", "오답 많음"] },
  grades: { headers: ["날짜", "이름", "과목", "시험명", "점수", "만점"], example: ["2026-08-16", "홍길동", "수학", "8월 모의고사", "85", "100"] },
};

function renderImport(root, classId) {
  const wrap = el(`<section class="panel">
    <div class="panel-header"><h2>데이터 가져오기 (CSV)</h2></div>
    <div class="import-guide">
      <p>엑셀에서 <b>다른 이름으로 저장 → CSV UTF-8(쉼표로 분리)</b> 로 저장한 뒤 아래에 업로드하세요.
      파일의 <b>제목행(헤더)</b>으로 종류를 자동 인식합니다 (학생명단 / 출결 / 숙제 / 성적, 여러 파일 동시 선택 가능).
      이름은 현재 <b>"${escapeHtml(Store.getClass(classId).name)}"</b> 학생명단과 일치해야 매칭됩니다.</p>
      <div class="template-list" id="template-list"></div>
    </div>
    <input type="file" id="csv-input" accept=".csv" multiple />
    <div id="import-report"></div>
  </section>`);
  root.appendChild(wrap);

  const templateList = wrap.querySelector("#template-list");
  const labelOf = { students: "학생명단", attendance: "출결", homework: "숙제", grades: "성적" };
  Object.entries(CSV_TEMPLATES).forEach(([key, tpl]) => {
    const btn = el(`<button class="btn btn-ghost" type="button">${labelOf[key]} 템플릿 내려받기</button>`);
    btn.addEventListener("click", () => downloadCSVTemplate(key, tpl));
    templateList.appendChild(btn);
  });

  const input = wrap.querySelector("#csv-input");
  const report = wrap.querySelector("#import-report");

  input.addEventListener("change", async () => {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    const combined = { students: 0, attendance: 0, homework: 0, grades: 0, unmatched: [], unknownFiles: [] };
    for (const file of files) {
      const text = await file.text();
      const objects = csvRowsToObjects(parseCSV(text));
      const { type, rows } = classifyCSV(objects);
      if (!type) {
        combined.unknownFiles.push(file.name);
        continue;
      }
      const result = Store.importRows(classId, rows);
      combined.students += result.students;
      combined.attendance += result.attendance;
      combined.homework += result.homework;
      combined.grades += result.grades;
      combined.unmatched.push(...result.unmatched);
    }
    report.innerHTML = "";
    report.appendChild(
      el(`<div class="import-result">
        <p>학생정보 ${combined.students}건, 출결 ${combined.attendance}건, 숙제 ${combined.homework}건, 성적 ${combined.grades}건 반영했습니다.</p>
        ${combined.unknownFiles.length ? `<p class="warn">형식을 인식하지 못한 파일: ${combined.unknownFiles.map(escapeHtml).join(", ")}</p>` : ""}
        ${
          combined.unmatched.length
            ? `<p class="warn">이름이 학생명단과 일치하지 않아 건너뜀:<br>${combined.unmatched.map(escapeHtml).join("<br>")}</p>`
            : ""
        }
      </div>`)
    );
    renderClassTabs();
    input.value = "";
  });
}

function downloadCSVTemplate(key, tpl) {
  const csv = [tpl.headers.join(","), tpl.example.join(",")].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${key}_템플릿.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- header actions (backup / restore) ---------------- */

function wireHeaderActions() {
  document.getElementById("backup-btn").addEventListener("click", () => {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `academy_backup_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const restoreInput = document.getElementById("restore-input");
  document.getElementById("restore-btn").addEventListener("click", () => restoreInput.click());
  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files[0];
    if (!file) return;
    if (!confirm("백업 파일로 복원하면 현재 데이터를 덮어씁니다. 계속할까요?")) {
      restoreInput.value = "";
      return;
    }
    const text = await file.text();
    try {
      await Store.restoreFromJSON(text);
      location.reload();
    } catch (e) {
      alert("백업 파일을 읽을 수 없습니다.");
    }
    restoreInput.value = "";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await Store.ready;
  init();
});
