const form = document.getElementById("metar-form");
const input = document.getElementById("icao-input");
const status = document.getElementById("status");
const results = document.getElementById("results");
const watchStatus = document.getElementById("watch-status");
const watchResults = document.getElementById("watch-results");
const watchRefresh = document.getElementById("watch-refresh");

const METAR_BASE = "https://aviationweather.gov/api/data/metar";
const TAF_BASE = "https://aviationweather.gov/api/data/taf";
const WATCH_URL =
  "https://meteorologia.aerocivil.gov.co/wxwatch/table?list_id=4&ceiling_minimum=40000&visibility_minimum=170000";

const formatStations = (value) => {
  return [...new Set(value
    .toUpperCase()
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter((code) => code.length))];
};

const renderStatus = (message, tone = "info") => {
  status.textContent = message;
  status.className = `status status--${tone}`;
};

const renderWatchStatus = (message, tone = "info") => {
  watchStatus.textContent = message;
  watchStatus.className = `status status--${tone}`;
};

const renderResults = (items, tafItems) => {
  results.innerHTML = "";

  if (!items.length) {
    results.innerHTML = "<p>No se encontraron reportes METAR.</p>";
    return;
  }

  const tafByStation = tafItems.reduce((acc, taf) => {
    if (taf.station) {
      acc[taf.station] = taf;
    }
    return acc;
  }, {});

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    const taf = tafByStation[item.station];
    card.innerHTML = `
      <h2>${item.station}</h2>
      <p>Hora (UTC): ${item.observation_time ?? "No disponible"}</p>
      <p>Temperatura: ${item.temp_c ?? "-"} °C</p>
      <p>Viento: ${item.wind_dir_degrees ?? "-"}° / ${item.wind_speed_kt ?? "-"} kt</p>
      <div class="card__metar">${item.raw_text ?? "METAR no disponible"}</div>
      <div class="card__taf">${taf?.raw_text ?? "TAF no disponible"}</div>
    `;
    results.appendChild(card);
  });
};

const parseWatchTable = (htmlText) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const table = doc.querySelector("table");

  if (!table) {
    return [];
  }

  const headers = [...table.querySelectorAll("thead th")].map((cell) =>
    cell.textContent.trim()
  );

  const rows = [...table.querySelectorAll("tbody tr")];
  return rows.map((row) => {
    const cells = [...row.querySelectorAll("td")].map((cell) =>
      cell.textContent.trim()
    );
    const data = {};
    headers.forEach((header, index) => {
      data[header || `col_${index}`] = cells[index] || "";
    });
    return data;
  });
};

const renderWatchResults = (items) => {
  watchResults.innerHTML = "";

  if (!items.length) {
    watchResults.innerHTML =
      "<p>No se encontraron alertas WX Watch en este momento.</p>";
    return;
  }

  items.forEach((item, index) => {
    const title =
      item.Estacion ||
      item.Aeropuerto ||
      item.ICAO ||
      item.Station ||
      `Alerta ${index + 1}`;
    const ceiling =
      item.Techo ||
      item.Ceiling ||
      item["Ceiling (ft)"] ||
      item["Techo (ft)"] ||
      "No disponible";
    const visibility =
      item.Visibilidad ||
      item.Visibility ||
      item["Visibilidad (m)"] ||
      item["Visibility (m)"] ||
      "No disponible";
    const phenomenon =
      item.Fenomeno ||
      item["Fenómeno"] ||
      item.Phenomenon ||
      item["Fenomeno significativo"] ||
      "Sin detalle";

    const card = document.createElement("article");
    card.className = "watch-card";
    card.innerHTML = `
      <h3>${title}</h3>
      <p class="watch-card__meta"><span class="watch-card__highlight">Techo:</span> ${ceiling}</p>
      <p class="watch-card__meta"><span class="watch-card__highlight">Visibilidad:</span> ${visibility}</p>
      <p class="watch-card__meta"><span class="watch-card__highlight">Fenómeno:</span> ${phenomenon}</p>
    `;
    watchResults.appendChild(card);
  });
};

const fetchMetar = async (stations) => {
  const params = new URLSearchParams({
    ids: stations.join(","),
    format: "json",
    hours: "2",
  });

  const response = await fetch(`${METAR_BASE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("No se pudo obtener la información METAR.");
  }
  return response.json();
};

const fetchTaf = async (stations) => {
  const params = new URLSearchParams({
    ids: stations.join(","),
    format: "json",
    hours: "8",
  });

  const response = await fetch(`${TAF_BASE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("No se pudo obtener la información TAF.");
  }
  return response.json();
};

const fetchWatchTable = async () => {
  const response = await fetch(WATCH_URL);
  if (!response.ok) {
    throw new Error("No se pudo obtener la tabla WX Watch.");
  }
  return response.text();
};

const loadWatch = async () => {
  renderWatchStatus("Actualizando alertas WX Watch...", "info");
  try {
    const htmlText = await fetchWatchTable();
    const items = parseWatchTable(htmlText);
    renderWatchResults(items);
    renderWatchStatus("WX Watch actualizado desde Aerocivil.", "success");
  } catch (error) {
    renderWatchStatus(
      "No se pudo cargar la tabla WX Watch. Intenta nuevamente más tarde.",
      "warning"
    );
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const stations = formatStations(input.value);

  if (!stations.length) {
    renderStatus("Ingresa al menos un código ICAO.", "warning");
    return;
  }

  renderStatus("Consultando METAR y TAF...", "info");
  results.innerHTML = "";

  try {
    const [metarData, tafData] = await Promise.all([
      fetchMetar(stations),
      fetchTaf(stations),
    ]);
    renderStatus(`Resultados para ${stations.join(", ")}.`, "success");
    renderResults(metarData, tafData);
  } catch (error) {
    renderStatus(error.message, "warning");
  }
});

watchRefresh.addEventListener("click", () => {
  loadWatch();
});

loadWatch();
