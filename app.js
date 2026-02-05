const form = document.getElementById("metar-form");
const input = document.getElementById("icao-input");
const status = document.getElementById("status");
const results = document.getElementById("results");
const watchStatus = document.getElementById("watch-status");
const watchResults = document.getElementById("watch-results");
const watchRefresh = document.getElementById("watch-refresh");

const METAR_BASE = "https://aviationweather.gov/api/data/metar";
const TAF_BASE = "https://aviationweather.gov/api/data/taf";
const NOAA_METAR_BASE =
  "https://tgftp.nws.noaa.gov/data/observations/metar/stations";
const NOAA_TAF_BASE = "https://tgftp.nws.noaa.gov/data/forecasts/taf/stations";
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

const mergeByStation = (primary, fallback) => {
  const map = primary.reduce((acc, item) => {
    if (item.station) {
      acc[item.station] = item;
    }
    return acc;
  }, {});

  fallback.forEach((item) => {
    if (item?.station && !map[item.station]) {
      map[item.station] = item;
    }
  });

  return Object.values(map);
};

const parseNoaaMetarText = (station, text) => {
  const lines = text.trim().split("\n").map((line) => line.trim());
  const rawText = lines[1] || lines[0];
  return {
    station,
    observation_time: lines[0] || null,
    raw_text: rawText || null,
  };
};

const parseNoaaTafText = (station, text) => {
  const lines = text.trim().split("\n").map((line) => line.trim());
  const rawText = lines.slice(1).join(" ");
  return {
    station,
    raw_text: rawText || lines[0] || null,
  };
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

const fetchNoaaMetar = async (stations) => {
  const responses = await Promise.all(
    stations.map(async (station) => {
      const response = await fetch(`${NOAA_METAR_BASE}/${station}.TXT`);
      if (!response.ok) {
        return null;
      }
      const text = await response.text();
      return parseNoaaMetarText(station, text);
    })
  );
  return responses.filter(Boolean);
};

const fetchNoaaTaf = async (stations) => {
  const responses = await Promise.all(
    stations.map(async (station) => {
      const response = await fetch(`${NOAA_TAF_BASE}/${station}.TXT`);
      if (!response.ok) {
        return null;
      }
      const text = await response.text();
      return parseNoaaTafText(station, text);
    })
  );
  return responses.filter(Boolean);
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
    let metarData = [];
    let tafData = [];
    let usedNoaa = false;

    try {
      metarData = await fetchMetar(stations);
    } catch (error) {
      metarData = [];
    }

    try {
      tafData = await fetchTaf(stations);
    } catch (error) {
      tafData = [];
    }

    if (metarData.length < stations.length) {
      const noaaMetar = await fetchNoaaMetar(stations);
      metarData = mergeByStation(metarData, noaaMetar);
      usedNoaa = usedNoaa || noaaMetar.length > 0;
    }

    if (tafData.length < stations.length) {
      const noaaTaf = await fetchNoaaTaf(stations);
      tafData = mergeByStation(tafData, noaaTaf);
      usedNoaa = usedNoaa || noaaTaf.length > 0;
    }

    const sourceNote = usedNoaa ? " (con respaldo NOAA)" : "";
    renderStatus(
      `Resultados para ${stations.join(", ")}.${sourceNote}`,
      "success"
    );
    renderResults(metarData, tafData);
  } catch (error) {
    renderStatus(error.message, "warning");
  }
});

watchRefresh.addEventListener("click", () => {
  loadWatch();
});

loadWatch();
