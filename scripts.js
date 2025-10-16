// --- State ---
const state = {
  rawRows: [],
  filteredRows: [],
  page: 1,
  rowsPerPage: 25,
  charts: {},
  map: null,
  mapLayer: null,
};

// --- Utility Functions ---
function parseDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString);
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function median(arr) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- DOM Elements ---
const loadStatus = document.getElementById("loadStatus");
const metricTrips = document.getElementById("metricTrips");
const metricMedianDistance = document.getElementById("metricMedianDistance");
const metricMedianDuration = document.getElementById("metricMedianDuration");
const tripsTableBody = document.querySelector("#tripsTable tbody");
const pageInfo = document.getElementById("pageInfo");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const rowsPerPageSelect = document.getElementById("rowsPerPage");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
const closeModal = document.getElementById("closeModal");

// --- Filter Controls ---
const startTime = document.getElementById("startTime");
const endTime = document.getElementById("endTime");
const passengerCount = document.getElementById("passengerCount");
const minDuration = document.getElementById("minDuration");
const maxDuration = document.getElementById("maxDuration");
const minDistance = document.getElementById("minDistance");
const maxDistance = document.getElementById("maxDistance");
const vendorId = document.getElementById("vendorId");
const sortBy = document.getElementById("sortBy");
const sortDir = document.getElementById("sortDir");
const refineBtn = document.getElementById("refineBtn");
const resetBtn = document.getElementById("resetBtn");

// --- Chart Elements ---
const durationHistCanvas = document.getElementById("durationHist");
const distanceHistCanvas = document.getElementById("distanceHist");
const vendorChartCanvas = document.getElementById("vendorChart");

// --- Map Element ---
const mapDiv = document.getElementById("map");

// --- Fetch Data ---
async function fetchTripsFromBackend() {
  loadStatus.textContent = "Fetching data from backend...";
  try {
    const response = await fetch("http://127.0.0.1:5000/api/trips");
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const trips = await response.json();
    state.rawRows = trips.map((trip) => ({
      id: trip.id,
      vendor_id: trip.vendor_id,
      pickup_datetime: parseDate(trip.pickup_datetime),
      dropoff_datetime: parseDate(trip.dropoff_datetime),
      passenger_count: trip.passenger_count,
      trip_duration: trip.trip_duration,
      pickup_latitude: trip.pickup_latitude,
      pickup_longitude: trip.pickup_longitude,
      dropoff_latitude: trip.dropoff_latitude,
      dropoff_longitude: trip.dropoff_longitude,
      distance_km: trip.pickup_latitude && trip.pickup_longitude && trip.dropoff_latitude && trip.dropoff_longitude
        ? haversineKm(trip.pickup_latitude, trip.pickup_longitude, trip.dropoff_latitude, trip.dropoff_longitude)
        : null,
    }));
    loadStatus.textContent = `Loaded ${state.rawRows.length.toLocaleString()} trips from the Database.`;
    applyFilters();
  } catch (error) {
    loadStatus.textContent = `There might be an error while fetching data: ${error.message}`;
    console.error("Error:", error);
  }
}

// --- Filtering & Sorting ---
function applyFilters() {
  let rows = state.rawRows.slice();

  // Filter by pickup time
  if (startTime.value) {
    const start = new Date(startTime.value);
    rows = rows.filter(r => r.pickup_datetime >= start);
  }
  if (endTime.value) {
    const end = new Date(endTime.value);
    rows = rows.filter(r => r.pickup_datetime <= end);
  }
  // Passengers
  if (passengerCount.value) {
    if (passengerCount.value === ">6") {
      rows = rows.filter(r => r.passenger_count > 6);
    } else {
      rows = rows.filter(r => r.passenger_count == passengerCount.value);
    }
  }
  // Duration
  if (minDuration.value) rows = rows.filter(r => r.trip_duration / 60 >= Number(minDuration.value));
  if (maxDuration.value) rows = rows.filter(r => r.trip_duration / 60 <= Number(maxDuration.value));
  // Distance
  if (minDistance.value) rows = rows.filter(r => r.distance_km >= Number(minDistance.value));
  if (maxDistance.value) rows = rows.filter(r => r.distance_km <= Number(maxDistance.value));
  // Vendor
  if (vendorId.value) rows = rows.filter(r => String(r.vendor_id) === vendorId.value);

  // Search
  const searchTerm = document.getElementById("searchBox").value.trim().toLowerCase();
  if (searchTerm) {
    rows = rows.filter(r =>
      String(r.id).toLowerCase().includes(searchTerm) ||
      (r.pickup_latitude && r.pickup_longitude && `${r.pickup_latitude},${r.pickup_longitude}`.includes(searchTerm)) ||
      (r.dropoff_latitude && r.dropoff_longitude && `${r.dropoff_latitude},${r.dropoff_longitude}`.includes(searchTerm))
    );
  }

  // Sorting
  const key = sortBy.value;
  const dir = sortDir.value === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (a[key] < b[key]) return -1 * dir;
    if (a[key] > b[key]) return 1 * dir;
    return 0;
  });

  state.filteredRows = rows;
  state.page = 1;
  renderTable();
  renderMetrics();
  renderCharts();
  renderMap();
}

function resetFilters() {
  startTime.value = "";
  endTime.value = "";
  passengerCount.value = "";
  minDuration.value = "";
  maxDuration.value = "";
  minDistance.value = "";
  maxDistance.value = "";
  vendorId.value = "";
  sortBy.value = "pickup_datetime";
  sortDir.value = "asc";
  applyFilters();
}

// --- Table Rendering ---
function renderTable() {
  const startIdx = (state.page - 1) * state.rowsPerPage;
  const endIdx = startIdx + state.rowsPerPage;
  const pageRows = state.filteredRows.slice(startIdx, endIdx);

  if (pageRows.length === 0) {
    tripsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:#ff9800; font-weight:bold;">
          No trips found. Try adjusting your filters or search.
        </td>
      </tr>
    `;
  } else {
    tripsTableBody.innerHTML = pageRows.map((row, idx) => `
      <tr>
        <td>${row.pickup_datetime ? row.pickup_datetime.toLocaleString() : "-"}</td>
        <td>${row.dropoff_datetime ? row.dropoff_datetime.toLocaleString() : "-"}</td>
        <td>${row.passenger_count}</td>
        <td>${(row.trip_duration / 60).toFixed(1)}</td>
        <td>${row.distance_km ? row.distance_km.toFixed(2) : "-"}</td>
        <td>${row.vendor_id}</td>
        <td><button class="nyc-btn" onclick="showDetails(${startIdx + idx})">View</button></td>
      </tr>
    `).join("");
  }

  const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / state.rowsPerPage));
  pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
  prevPageBtn.disabled = state.page <= 1;
  nextPageBtn.disabled = state.page >= totalPages;
}

// --- Metrics Rendering ---
function renderMetrics() {
  metricTrips.textContent = state.filteredRows.length.toLocaleString();
  metricMedianDistance.textContent = median(state.filteredRows.map(r => r.distance_km || 0)).toFixed(2);
  metricMedianDuration.textContent = median(state.filteredRows.map(r => r.trip_duration / 60)).toFixed(1);
}

// --- Charts Rendering ---
function renderCharts() {
  // Duration histogram
  const durations = state.filteredRows.map(r => r.trip_duration / 60);
  const bins = Array(20).fill(0);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const binSize = (max - min) / bins.length || 1;
  durations.forEach(d => {
    const idx = Math.min(bins.length - 1, Math.floor((d - min) / binSize));
    bins[idx]++;
  });
  const labels = bins.map((_, i) => `${(min + i * binSize).toFixed(1)}-${(min + (i + 1) * binSize).toFixed(1)}`);

  if (state.charts.durationHist) state.charts.durationHist.destroy();
  state.charts.durationHist = new Chart(durationHistCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Trip Duration (min)",
        data: bins,
        backgroundColor: "#ffd600",
      }]
    },
    options: {
      scales: { x: { title: { display: true, text: "Duration (min)" } }, y: { title: { display: true, text: "Count" } } },
      plugins: { legend: { display: false } }
    }
  });

  // Distance histogram
  const distances = state.filteredRows.map(r => r.distance_km || 0);
  const bins2 = Array(20).fill(0);
  const min2 = Math.min(...distances);
  const max2 = Math.max(...distances);
  const binSize2 = (max2 - min2) / bins2.length || 1;
  distances.forEach(d => {
    const idx = Math.min(bins2.length - 1, Math.floor((d - min2) / binSize2));
    bins2[idx]++;
  });
  const labels2 = bins2.map((_, i) => `${(min2 + i * binSize2).toFixed(1)}-${(min2 + (i + 1) * binSize2).toFixed(1)}`);

  if (state.charts.distanceHist) state.charts.distanceHist.destroy();
  state.charts.distanceHist = new Chart(distanceHistCanvas, {
    type: "bar",
    data: {
      labels: labels2,
      datasets: [{
        label: "Distance (km)",
        data: bins2,
        backgroundColor: "#ff9800",
      }]
    },
    options: {
      scales: { x: { title: { display: true, text: "Distance (km)" } }, y: { title: { display: true, text: "Count" } } },
      plugins: { legend: { display: false } }
    }
  });

  // Vendor share donut
  const vendorCounts = {};
  state.filteredRows.forEach(r => {
    vendorCounts[r.vendor_id] = (vendorCounts[r.vendor_id] || 0) + 1;
  });
  if (state.charts.vendor) state.charts.vendor.destroy();
  state.charts.vendor = new Chart(vendorChartCanvas, {
    type: "doughnut",
    data: {
      labels: Object.keys(vendorCounts).map(v => `Vendor ${v}`),
      datasets: [{
        data: Object.values(vendorCounts),
        backgroundColor: ["#ffd600", "#ff9800", "#23272b"],
      }]
    },
    options: {
      plugins: { legend: { display: true } }
    }
  });
}

// --- Map Rendering ---
function renderMap() {
  if (!state.map) {
    state.map = L.map(mapDiv).setView([40.75, -73.98], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
  }
  if (state.mapLayer) {
    state.map.removeLayer(state.mapLayer);
  }
  const points = state.filteredRows.slice(0, 500).map(r => [r.pickup_latitude, r.pickup_longitude]).filter(p => p[0] && p[1]);
  state.mapLayer = L.layerGroup(points.map(([lat, lon]) =>
    L.circleMarker([lat, lon], { radius: 3, color: "#ffd600", fillOpacity: 0.7 })
  ));
  state.mapLayer.addTo(state.map);
}

// --- Pagination ---
prevPageBtn.onclick = () => {
  if (state.page > 1) {
    state.page--;
    renderTable();
  }
};
nextPageBtn.onclick = () => {
  const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / state.rowsPerPage));
  if (state.page < totalPages) {
    state.page++;
    renderTable();
  }
};
rowsPerPageSelect.onchange = () => {
  state.rowsPerPage = Number(rowsPerPageSelect.value);
  state.page = 1;
  renderTable();
};

// --- Filter Events ---
refineBtn.onclick = applyFilters;
resetBtn.onclick = resetFilters;
document.getElementById("searchBox").oninput = applyFilters;

// --- Modal ---
window.showDetails = function(idx) {
  const trip = state.filteredRows[idx];
  modalBody.innerHTML = `
    <h2>Trip Details</h2>
    <ul>
      <li><b>Pickup:</b> ${trip.pickup_datetime ? trip.pickup_datetime.toLocaleString() : "-"}</li>
      <li><b>Dropoff:</b> ${trip.dropoff_datetime ? trip.dropoff_datetime.toLocaleString() : "-"}</li>
      <li><b>Passengers:</b> ${trip.passenger_count}</li>
      <li><b>Duration:</b> ${(trip.trip_duration / 60).toFixed(1)} min</li>
      <li><b>Distance:</b> ${trip.distance_km ? trip.distance_km.toFixed(2) : "-"} km</li>
      <li><b>Vendor:</b> ${trip.vendor_id}</li>
      <li><b>Pickup Location:</b> (${trip.pickup_latitude}, ${trip.pickup_longitude})</li>
      <li><b>Dropoff Location:</b> (${trip.dropoff_latitude}, ${trip.dropoff_longitude})</li>
    </ul>
  `;
  modal.style.display = "flex";
};
closeModal.onclick = () => { modal.style.display = "none"; };
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

// --- Initial Load ---
document.addEventListener("DOMContentLoaded", () => {
  fetchTripsFromBackend();
});
