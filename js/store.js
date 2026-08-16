/* ============================================================
   store.js — data model, persistence (server-side JSON file
   under data/store.json so the whole project folder — code +
   data — can be copied or synced to another computer), CSV import

   Shape: data is organized by 학기(semester) → 반(class). Each
   semester keeps its own independent set of classes/students/
   records, so semesters accumulate as history rather than
   overwriting each other. A student's public link (?id=...) has
   no semester in it — student-app.js resolves it by scanning all
   semesters, so links keep working even as semesters are added.
   ============================================================ */

// thresholds for the roster "주의 필요" flags
const ATTENTION_ABSENCE_STREAK = 2;
const ATTENTION_HOMEWORK_STREAK = 2;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function emptyClassBucket() {
  return { students: [], attendance: [], homework: [], grades: [], announcements: [], materials: [], notes: {} };
}

function defaultSemesterClasses() {
  // convenience default when a semester is first created — instructors
  // typically run ~6-7 classes per semester, but can add/rename/remove freely
  return Array.from({ length: 7 }, (_, i) => ({ id: uid(), name: `${i + 1}반` }));
}

function defaultData() {
  const semesterId = uid();
  const classes = defaultSemesterClasses();
  const bySemester = { [semesterId]: { classes, records: {} } };
  classes.forEach((c) => (bySemester[semesterId].records[c.id] = emptyClassBucket()));
  return { version: 2, semesters: [{ id: semesterId, name: "1학기" }], bySemester };
}

// migrates the pre-semester flat shape (version 1: data.classes / data.students
// keyed directly by classId) into a single "1학기" semester so nothing is lost
// if this ever runs against real data saved by an earlier version of the app.
function migrateIfNeeded(parsed) {
  if (!parsed || parsed.version === 2) return parsed;
  if (!parsed.classes || !parsed.students) return null; // unrecognized/empty — caller falls back to defaultData()

  const semesterId = uid();
  const classes = parsed.classes;
  const records = {};
  classes.forEach((c) => {
    records[c.id] = {
      students: parsed.students?.[c.id] || [],
      attendance: parsed.attendance?.[c.id] || [],
      homework: parsed.homework?.[c.id] || [],
      grades: parsed.grades?.[c.id] || [],
      announcements: parsed.announcements?.[c.id] || [],
      materials: parsed.materials?.[c.id] || [],
      notes: {},
    };
  });
  return {
    version: 2,
    semesters: [{ id: semesterId, name: "1학기" }],
    bySemester: { [semesterId]: { classes, records } },
  };
}

const Store = (() => {
  let data = defaultData();
  let saveTimer = null;
  let saveFailed = false;

  function bucket(semesterId, classId) {
    const sem = data.bySemester[semesterId];
    if (!sem) return emptyClassBucket();
    if (!sem.records[classId]) sem.records[classId] = emptyClassBucket();
    return sem.records[classId];
  }

  async function load() {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const parsed = await res.json();
        if (parsed && Object.keys(parsed).length > 0) {
          data = migrateIfNeeded(parsed) || defaultData();
        }
      }
    } catch (e) {
      console.error("서버에서 데이터를 불러오지 못했습니다. 초기 상태로 시작합니다.", e);
    }
  }

  // resolved once the initial fetch from data/store.json (via the local
  // dev server) completes; app.js / student-app.js wait on this before first render
  const ready = load();

  function flush() {
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(() => {
        if (saveFailed) {
          saveFailed = false;
          document.dispatchEvent(new CustomEvent("store:save-ok"));
        }
      })
      .catch((e) => {
        console.error("저장 실패:", e);
        saveFailed = true;
        document.dispatchEvent(new CustomEvent("store:save-error"));
      });
  }

  // batches rapid successive writes (e.g. CSV import loops) into one request
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }

  return {
    ready,
    get all() {
      return data;
    },

    /* ---------------- 학기 ---------------- */
    semesters() {
      return data.semesters;
    },
    addSemester(name) {
      const id = uid();
      const classes = defaultSemesterClasses();
      const records = {};
      classes.forEach((c) => (records[c.id] = emptyClassBucket()));
      data.semesters.push({ id, name: name || `${data.semesters.length + 1}학기` });
      data.bySemester[id] = { classes, records };
      save();
      return id;
    },
    renameSemester(semesterId, name) {
      const s = data.semesters.find((s) => s.id === semesterId);
      if (s) {
        s.name = name;
        save();
      }
    },
    removeSemester(semesterId) {
      data.semesters = data.semesters.filter((s) => s.id !== semesterId);
      delete data.bySemester[semesterId];
      save();
    },

    /* ---------------- 반 ---------------- */
    classes(semesterId) {
      return data.bySemester[semesterId]?.classes || [];
    },
    getClass(semesterId, classId) {
      return this.classes(semesterId).find((c) => c.id === classId);
    },
    addClass(semesterId, name) {
      const sem = data.bySemester[semesterId];
      if (!sem) return null;
      const id = uid();
      sem.classes.push({ id, name: name || `${sem.classes.length + 1}반` });
      sem.records[id] = emptyClassBucket();
      save();
      return id;
    },
    renameClass(semesterId, classId, name) {
      const c = this.getClass(semesterId, classId);
      if (c) {
        c.name = name;
        save();
      }
    },
    removeClass(semesterId, classId) {
      const sem = data.bySemester[semesterId];
      if (!sem) return;
      sem.classes = sem.classes.filter((c) => c.id !== classId);
      delete sem.records[classId];
      save();
    },

    /* ---------------- 학생 ---------------- */
    students(semesterId, classId) {
      return bucket(semesterId, classId).students;
    },
    addStudent(semesterId, classId, student) {
      const row = {
        id: uid(),
        name: "",
        studentPhone: "",
        parentPhone: "",
        parentRelation: "",
        status: "재원",
        ...student,
      };
      bucket(semesterId, classId).students.push(row);
      save();
      return row;
    },
    updateStudent(semesterId, classId, studentId, patch) {
      const row = bucket(semesterId, classId).students.find((s) => s.id === studentId);
      if (row) {
        Object.assign(row, patch);
        save();
      }
    },
    removeStudent(semesterId, classId, studentId) {
      const b = bucket(semesterId, classId);
      b.students = b.students.filter((s) => s.id !== studentId);
      // cascade-clean related records so orphans don't linger
      b.attendance = b.attendance.filter((r) => r.studentId !== studentId);
      b.homework = b.homework.filter((r) => r.studentId !== studentId);
      b.grades = b.grades.filter((r) => r.studentId !== studentId);
      delete b.notes[studentId];
      save();
    },
    findStudentByName(semesterId, classId, name) {
      const target = (name || "").trim();
      return bucket(semesterId, classId).students.find((s) => s.name.trim() === target);
    },
    // scans every semester/class — used by the student-facing page, whose
    // link (?id=studentId) intentionally carries no semester/class info
    findStudentGlobally(studentId) {
      if (!studentId) return null;
      for (const sem of data.semesters) {
        for (const cls of this.classes(sem.id)) {
          const student = this.students(sem.id, cls.id).find((s) => s.id === studentId);
          if (student) return { semester: sem, classInfo: cls, student };
        }
      }
      return null;
    },

    /* ---------------- 출결 ---------------- */
    attendance(semesterId, classId) {
      return bucket(semesterId, classId).attendance;
    },
    setAttendance(semesterId, classId, studentId, date, status, note) {
      const list = bucket(semesterId, classId).attendance;
      let row = list.find((r) => r.studentId === studentId && r.date === date);
      if (!row) {
        row = { id: uid(), studentId, date, status, note: note || "" };
        list.push(row);
      } else {
        row.status = status;
        if (note !== undefined) row.note = note;
      }
      save();
    },

    // trailing-streak flags so an instructor juggling several classes can
    // spot students needing attention without reading every row by hand
    attentionFlags(semesterId, classId, studentId) {
      const flags = [];
      const b = bucket(semesterId, classId);
      const mine = (list) => list.filter((r) => r.studentId === studentId).sort((a, b) => (a.date < b.date ? 1 : -1));

      let absentStreak = 0;
      for (const r of mine(b.attendance)) {
        if (r.status === "결석") absentStreak++;
        else break;
      }
      if (absentStreak >= ATTENTION_ABSENCE_STREAK) flags.push(`결석 ${absentStreak}회 연속`);

      let missedStreak = 0;
      for (const r of mine(b.homework)) {
        if (r.status === "미완료") missedStreak++;
        else break;
      }
      if (missedStreak >= ATTENTION_HOMEWORK_STREAK) flags.push(`숙제 미완료 ${missedStreak}회 연속`);

      return flags;
    },

    /* ---------------- 숙제 ---------------- */
    homework(semesterId, classId) {
      return bucket(semesterId, classId).homework;
    },
    setHomework(semesterId, classId, studentId, date, status, note) {
      const list = bucket(semesterId, classId).homework;
      let row = list.find((r) => r.studentId === studentId && r.date === date);
      if (!row) {
        row = { id: uid(), studentId, date, status, note: note || "" };
        list.push(row);
      } else {
        row.status = status;
        row.note = note || "";
      }
      save();
    },

    /* ---------------- 성적 ---------------- */
    grades(semesterId, classId) {
      return bucket(semesterId, classId).grades;
    },
    addGrade(semesterId, classId, grade) {
      const row = { id: uid(), date: "", subject: "", testName: "", score: 0, maxScore: 100, ...grade };
      bucket(semesterId, classId).grades.push(row);
      save();
      return row;
    },
    removeGrade(semesterId, classId, gradeId) {
      const b = bucket(semesterId, classId);
      b.grades = b.grades.filter((g) => g.id !== gradeId);
      save();
    },

    /* ---------------- 공지사항 ---------------- */
    announcements(semesterId, classId) {
      return bucket(semesterId, classId).announcements;
    },
    addAnnouncement(semesterId, classId, announcement) {
      const row = { id: uid(), date: todayISO(), title: "", body: "", ...announcement };
      bucket(semesterId, classId).announcements.push(row);
      save();
      return row;
    },
    removeAnnouncement(semesterId, classId, announcementId) {
      const b = bucket(semesterId, classId);
      b.announcements = b.announcements.filter((a) => a.id !== announcementId);
      save();
    },

    /* ---------------- 과제자료 ---------------- */
    materials(semesterId, classId) {
      return bucket(semesterId, classId).materials;
    },
    addMaterial(semesterId, classId, material) {
      const row = { id: uid(), date: todayISO(), title: "", fileName: "", size: 0, ...material };
      bucket(semesterId, classId).materials.push(row);
      save();
      return row;
    },
    removeMaterial(semesterId, classId, materialId) {
      const b = bucket(semesterId, classId);
      b.materials = b.materials.filter((m) => m.id !== materialId);
      save();
      // best-effort: also delete the file on disk (server ignores if already gone)
      fetch(
        `/api/upload?semesterId=${encodeURIComponent(semesterId)}&classId=${encodeURIComponent(classId)}&materialId=${encodeURIComponent(
          materialId
        )}`,
        { method: "DELETE" }
      ).catch(() => {});
    },

    /* ---------------- 상담 메모 (강사 전용 — 학생에게 보이지 않음) ---------------- */
    notes(semesterId, classId, studentId) {
      return bucket(semesterId, classId).notes[studentId] || [];
    },
    addNote(semesterId, classId, studentId, note) {
      const b = bucket(semesterId, classId);
      if (!b.notes[studentId]) b.notes[studentId] = [];
      const row = { id: uid(), date: todayISO(), body: "", ...note };
      b.notes[studentId].push(row);
      save();
      return row;
    },
    removeNote(semesterId, classId, studentId, noteId) {
      const b = bucket(semesterId, classId);
      if (!b.notes[studentId]) return;
      b.notes[studentId] = b.notes[studentId].filter((n) => n.id !== noteId);
      save();
    },

    /* ---------------- CSV 가져오기 ---------------- */
    importRows(semesterId, classId, rows) {
      // rows: [{type, ...fields}] already classified; returns a report
      const report = { students: 0, attendance: 0, homework: 0, grades: 0, unmatched: [] };
      rows.forEach((r) => {
        if (r.type === "student") {
          let s = this.findStudentByName(semesterId, classId, r.name);
          if (!s) s = this.addStudent(semesterId, classId, { name: r.name });
          this.updateStudent(semesterId, classId, s.id, {
            studentPhone: r.studentPhone || s.studentPhone,
            parentPhone: r.parentPhone || s.parentPhone,
            parentRelation: r.parentRelation || s.parentRelation,
            status: r.status || s.status,
          });
          report.students++;
        } else if (r.type === "attendance") {
          const s = this.findStudentByName(semesterId, classId, r.name);
          if (!s) {
            report.unmatched.push(`[출결] ${r.name} (${r.date})`);
            return;
          }
          this.setAttendance(semesterId, classId, s.id, r.date, r.status);
          report.attendance++;
        } else if (r.type === "homework") {
          const s = this.findStudentByName(semesterId, classId, r.name);
          if (!s) {
            report.unmatched.push(`[숙제] ${r.name} (${r.date})`);
            return;
          }
          this.setHomework(semesterId, classId, s.id, r.date, r.status, r.note);
          report.homework++;
        } else if (r.type === "grade") {
          const s = this.findStudentByName(semesterId, classId, r.name);
          if (!s) {
            report.unmatched.push(`[성적] ${r.name} (${r.date})`);
            return;
          }
          this.addGrade(semesterId, classId, {
            studentId: s.id,
            date: r.date,
            subject: r.subject,
            testName: r.testName,
            score: Number(r.score) || 0,
            maxScore: Number(r.maxScore) || 100,
          });
          report.grades++;
        }
      });
      return report;
    },

    /* ---------------- 백업 / 동기화 ---------------- */
    exportJSON() {
      return JSON.stringify(data, null, 2);
    },
    resetAll() {
      data = defaultData();
      save();
    },
    async restoreFromJSON(text) {
      const parsed = JSON.parse(text);
      data = migrateIfNeeded(parsed) || defaultData();
      clearTimeout(saveTimer);
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    // re-pulls data/store.json without touching in-progress local edits'
    // save timer — used by the read-only student page to auto-refresh
    async refresh() {
      await load();
      document.dispatchEvent(new CustomEvent("store:refreshed"));
    },
  };
})();

/* ---------------- CSV parsing ---------------- */

function parseCSV(text) {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // ignore, \n handles line break
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvRowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (r[i] || "").trim()));
    return obj;
  });
}

// classify a parsed CSV (array of row objects) into normalized import rows
function classifyCSV(objects) {
  if (objects.length === 0) return { type: null, rows: [] };
  const headers = new Set(Object.keys(objects[0]));

  if (headers.has("학생연락처") || headers.has("학부모연락처")) {
    return {
      type: "students",
      rows: objects.map((o) => ({
        type: "student",
        name: o["이름"],
        studentPhone: o["학생연락처"],
        parentPhone: o["학부모연락처"],
        parentRelation: o["학부모관계"],
        status: o["상태"],
      })),
    };
  }
  if (headers.has("메모") && headers.has("상태")) {
    return {
      type: "homework",
      rows: objects.map((o) => ({
        type: "homework",
        name: o["이름"],
        date: o["날짜"],
        status: o["상태"],
        note: o["메모"],
      })),
    };
  }
  if (headers.has("점수") || headers.has("만점")) {
    return {
      type: "grades",
      rows: objects.map((o) => ({
        type: "grade",
        name: o["이름"],
        date: o["날짜"],
        subject: o["과목"],
        testName: o["시험명"],
        score: o["점수"],
        maxScore: o["만점"],
      })),
    };
  }
  if (headers.has("상태") && headers.has("날짜")) {
    return {
      type: "attendance",
      rows: objects.map((o) => ({
        type: "attendance",
        name: o["이름"],
        date: o["날짜"],
        status: o["상태"],
      })),
    };
  }
  return { type: null, rows: [] };
}
