async function getJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function percent(value) {
  return `${value.toFixed(2)}%`;
}

function money(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function renderFleet(rows) {
  const tbody = document.querySelector("#fleet tbody");
  tbody.innerHTML = rows.map((row) => `
    <tr data-vessel="${row.vesselId}">
      <td>${row.reviewPriority}</td>
      <td>${row.vesselId}</td>
      <td>${percent(row.latestSpeedLossPct)}</td>
      <td>${percent(row.foulingAttributionPct)}</td>
      <td>${row.confidence}</td>
      <td>${row.dataQualityScore}</td>
    </tr>
  `).join("");
}

function renderPerformance(rows) {
  const el = document.querySelector("#performance");
  el.innerHTML = rows.map((row) => `
    <div class="metric">
      <span>${row.date}</span>
      <strong>${row.dailyFoc.toFixed(2)} MT/day</strong>
      <small>${percent(row.speedLossPct)} speed loss</small>
    </div>
  `).join("");
}

function renderBeforeAfter(data) {
  const impact = data.businessImpact;
  document.querySelector("#business").innerHTML = `
    <div class="metric"><span>Recovery</span><strong>${percent(data.recoveryPct)}</strong></div>
    <div class="metric"><span>Daily avoidable cost</span><strong>${money(impact.dailyAvoidableCostUsd)}</strong></div>
    <div class="metric"><span>Annual fuel cost</span><strong>${money(impact.annualizedFuelCostUsd)}</strong></div>
    <div class="metric"><span>Annual CO2</span><strong>${Math.round(impact.annualizedCo2MetricTons).toLocaleString()} t</strong></div>
    <div class="metric"><span>Payback</span><strong>${impact.paybackDays.toFixed(1)} days</strong></div>
  `;
}

function renderBrief(data) {
  const links = data.citedMetrics.map((metric) =>
    `<a href="${metric.href}" target="_blank">${metric.metricId}: ${metric.value}</a>`).join("");
  document.querySelector("#brief").innerHTML = `
    <div class="brief-meta">${data.mode} · ${new Date(data.generatedAt).toLocaleString()}</div>
    <p>${data.briefText}</p>
    <div class="citations">${links}</div>
  `;
}

async function boot() {
  const vesselId = "YM-DEMO-01";
  const [fleet, performance, beforeAfter, quality] = await Promise.all([
    getJson("/api/fleet/summary"),
    getJson(`/api/vessels/${vesselId}/performance`),
    getJson(`/api/vessels/${vesselId}/before-after?eventId=event-2025-03-cleaning`),
    getJson("/api/data-quality/summary")
  ]);
  renderFleet(fleet);
  renderPerformance(performance);
  renderBeforeAfter(beforeAfter);
  document.querySelector("#quality").textContent =
    `${quality.exportedRows}/${quality.totalRows} rows exported; flags: ${JSON.stringify(quality.flagCounts)}`;

  async function loadBrief(forceFallback) {
    document.querySelector("#brief").textContent = "Generating...";
    const suffix = forceFallback ? "?forceFallback=true" : "";
    renderBrief(await getJson(`/api/vessels/${vesselId}/ai-brief${suffix}`, { method: "POST" }));
  }

  document.querySelector("#generate").addEventListener("click", () => loadBrief(false));
  document.querySelector("#force-fallback").addEventListener("click", () => loadBrief(true));
}

boot().catch((error) => {
  document.querySelector("#app-error").textContent = error.message;
});
