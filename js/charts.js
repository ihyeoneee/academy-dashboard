/* ============================================================
   charts.js — inline-SVG line chart for grade trends
   Categorical colors follow the validated fixed-order palette;
   hover crosshair + tooltip; legend always shown for >=2 series.
   ============================================================ */

const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

/**
 * renderLineChart
 * @param {HTMLElement} container
 * @param {Object} opts
 *   categories: string[] (x labels, chronological)
 *   series: [{ label, color?, values: (number|null)[], points: any[] }]
 *   yLabel: string
 *   yDomain: [min, max]
 */
function renderLineChart(container, opts) {
  const { categories, series, yLabel } = opts;
  container.innerHTML = "";

  if (!categories.length || !series.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "표시할 성적 데이터가 없습니다.";
    container.appendChild(empty);
    return;
  }

  const width = Math.max(container.clientWidth || 640, 320);
  const height = 320;
  const margin = { top: 16, right: 16, bottom: 40, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  let [yMin, yMax] = opts.yDomain || [0, 100];
  const xStep = categories.length > 1 ? plotW / (categories.length - 1) : 0;
  const xAt = (i) => margin.left + (categories.length > 1 ? i * xStep : plotW / 2);
  const yAt = (v) => margin.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", height);
  svg.classList.add("line-chart-svg");

  const gridGroup = document.createElementNS(svgNS, "g");
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = yMin + ((yMax - yMin) * t) / ticks;
    const y = yAt(v);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", margin.left);
    line.setAttribute("x2", width - margin.right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "grid-line");
    gridGroup.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", margin.left - 8);
    label.setAttribute("y", y + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "axis-label");
    label.textContent = Math.round(v);
    gridGroup.appendChild(label);
  }
  svg.appendChild(gridGroup);

  // x-axis labels (skip to avoid overlap on many categories)
  const xLabelGroup = document.createElementNS(svgNS, "g");
  const maxLabels = Math.max(2, Math.floor(plotW / 70));
  const stride = Math.max(1, Math.ceil(categories.length / maxLabels));
  categories.forEach((cat, i) => {
    if (i % stride !== 0 && i !== categories.length - 1) return;
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", xAt(i));
    label.setAttribute("y", height - margin.bottom + 20);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "axis-label");
    label.textContent = cat;
    xLabelGroup.appendChild(label);
  });
  svg.appendChild(xLabelGroup);

  // baseline
  const baseline = document.createElementNS(svgNS, "line");
  baseline.setAttribute("x1", margin.left);
  baseline.setAttribute("x2", width - margin.right);
  baseline.setAttribute("y1", margin.top + plotH);
  baseline.setAttribute("y2", margin.top + plotH);
  baseline.setAttribute("class", "axis-baseline");
  svg.appendChild(baseline);

  // series lines + markers
  const seriesGroup = document.createElementNS(svgNS, "g");
  series.forEach((s, si) => {
    const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
    let d = "";
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const cmd = d === "" ? "M" : "L";
      d += `${cmd}${xAt(i)},${yAt(v)} `;
    });
    if (d) {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d.trim());
      path.setAttribute("class", "series-line");
      path.setAttribute("stroke", color);
      seriesGroup.appendChild(path);
    }
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", xAt(i));
      c.setAttribute("cy", yAt(v));
      c.setAttribute("r", 4);
      c.setAttribute("class", "series-marker");
      c.setAttribute("fill", color);
      c.dataset.si = si;
      c.dataset.i = i;
      seriesGroup.appendChild(c);
    });
  });
  svg.appendChild(seriesGroup);

  // hover crosshair + tooltip
  const crosshair = document.createElementNS(svgNS, "line");
  crosshair.setAttribute("y1", margin.top);
  crosshair.setAttribute("y2", margin.top + plotH);
  crosshair.setAttribute("class", "crosshair");
  crosshair.style.display = "none";
  svg.appendChild(crosshair);

  const hitRect = document.createElementNS(svgNS, "rect");
  hitRect.setAttribute("x", margin.left);
  hitRect.setAttribute("y", margin.top);
  hitRect.setAttribute("width", plotW);
  hitRect.setAttribute("height", plotH);
  hitRect.setAttribute("fill", "transparent");
  svg.appendChild(hitRect);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.style.display = "none";
  container.style.position = "relative";

  hitRect.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const scale = width / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    let idx = Math.round((mx - margin.left) / (xStep || 1));
    idx = Math.max(0, Math.min(categories.length - 1, idx));
    crosshair.setAttribute("x1", xAt(idx));
    crosshair.setAttribute("x2", xAt(idx));
    crosshair.style.display = "block";

    const lines = series
      .map((s, si) => {
        const v = s.values[idx];
        if (v === null || v === undefined) return null;
        const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
        const raw = s.points && s.points[idx];
        const rawText = raw ? ` (${raw.score}/${raw.maxScore})` : "";
        return `<span class="tt-row"><span class="tt-dot" style="background:${color}"></span>${s.label}: <b>${v.toFixed(1)}</b>${rawText}</span>`;
      })
      .filter(Boolean);
    if (lines.length === 0) {
      tooltip.style.display = "none";
      return;
    }
    tooltip.innerHTML = `<div class="tt-title">${categories[idx]}</div>${lines.join("")}`;
    tooltip.style.display = "block";
    const leftPct = (xAt(idx) / width) * 100;
    tooltip.style.left = leftPct > 65 ? "auto" : `${leftPct}%`;
    tooltip.style.right = leftPct > 65 ? `${100 - leftPct}%` : "auto";
    tooltip.style.top = "8px";
  });
  hitRect.addEventListener("mouseleave", () => {
    crosshair.style.display = "none";
    tooltip.style.display = "none";
  });

  if (yLabel) {
    const yl = document.createElementNS(svgNS, "text");
    yl.setAttribute("x", -(margin.top + plotH / 2));
    yl.setAttribute("y", 14);
    yl.setAttribute("transform", "rotate(-90)");
    yl.setAttribute("text-anchor", "middle");
    yl.setAttribute("class", "axis-label");
    yl.textContent = yLabel;
    svg.appendChild(yl);
  }

  container.appendChild(svg);
  container.appendChild(tooltip);

  // legend (always present for >=2 series; single series needs no box)
  if (series.length >= 1) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    series.forEach((s, si) => {
      const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
      const item = document.createElement("span");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${s.label}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }
}
