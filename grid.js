// ===================== Maidenhead locator <-> lat/lon =====================

function latlon2loc(lat, lon) { // lat/lon -> Maidenhead locator
  lat += 90;  // lat origin of Maidenhead is 90S
  lon += 180; // lon origin of Maidenhead is 180W
  var units = 1036800; // 18 fields * 10 squares * 24 subsquares * 10 extended square

  // extended subsquare
  var latUnits = Math.floor(lat * units / 24);
  var lonUnits = Math.floor(lon * units / 24);
  var locator = String.fromCharCode(65 + (lonUnits % 24), 65 + (latUnits % 24));

  // extended square
  latUnits = Math.floor(latUnits / 180.0);
  lonUnits = Math.floor(lonUnits / 360.0);
  locator = String.fromCharCode(48 + (lonUnits % 10), 48 + (latUnits % 10)) + locator;

  // subsquare
  latUnits = Math.floor(latUnits / 10);
  lonUnits = Math.floor(lonUnits / 10);
  locator = String.fromCharCode(65 + (lonUnits % 24), 65 + (latUnits % 24)) + locator;

  // square
  latUnits = Math.floor(latUnits / 24);
  lonUnits = Math.floor(lonUnits / 24);
  locator = String.fromCharCode(48 + (lonUnits % 10), 48 + (latUnits % 10)) + locator;

  // field
  latUnits = Math.floor(latUnits / 10);
  lonUnits = Math.floor(lonUnits / 10);
  locator = String.fromCharCode(65 + lonUnits, 65 + latUnits) + locator;

  return locator;
}

function loc2latlon(locator) { // Maidenhead locator -> {lat, lon}
  if (locator.length === 6) {
    locator = locator + "55AA";
  }
  if (locator.length === 8) {
    locator = locator + "LL";
  }
  if (locator.length !== 10) {
    alert("Locator format incorrect");
    return null;
  }

  var loca = [];
  for (var i = 0; i < 10; i++) {
    loca[i] = locator.charCodeAt(i) - 65;
  }
  loca[2] += 17;
  loca[3] += 17;
  loca[6] += 17;
  loca[7] += 17;

  var lon = (loca[0] * 20 + loca[2] * 2 + loca[4] / 12 + loca[6] / 120 + loca[8] / 2880 - 180);
  var lat = (loca[1] * 10 + loca[3] + loca[5] / 24 + loca[7] / 240 + loca[9] / 5760 - 90);

  return { lat: lat, lon: lon };
}

// ===================== Math helpers =====================

function toRadian(degree) {
  return degree * Math.PI / 180;
}

function round(value, precision) {
  var multiplier = Math.pow(10, precision || 0);
  return Math.round(value * multiplier) / multiplier;
}

// ===================== Locator search box =====================

// Shared by both the "search" input (reloads the page) and any
// programmatic call (e.g. clicking a locator link) that shouldn't reload.
function goToLocator(rawValue, shouldReload) {
  var newloc = rawValue.toUpperCase();
  var isSixChar = /^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(newloc);
  var isFourChar = /^[A-R]{2}[0-9]{2}$/.test(newloc);

  if (isSixChar) {
    sessionStorage.setItem('Myloc', newloc);
    sessionStorage.setItem('zoomLevel', 12);
  } else if (isFourChar) {
    sessionStorage.setItem('Myloc', newloc + 'LL');
    sessionStorage.setItem('zoomLevel', 9);
  } else {
    alert("Locator must be 4 or 6 characters: " + rawValue);
    return;
  }

  if (shouldReload) {
    location.reload();
  }
}

function locate() {
  var newloc = document.forms["myform"].elements["newloc"].value;
  if (newloc) {
    goToLocator(newloc, true);
  } else {
    alert("Please enter a locator");
  }
}

function directe(value) {
  goToLocator(value, false);
}

function showCopyright() {
  var cr = document.getElementById('copyright');
  if (!cr) {
    cr = document.createElement('div');
    cr.id = 'copyright';
    cr.className = 'copyright';
    cr.style.cssText = [
      'position: fixed',
      'left: 50%',
      'bottom: 50%',
      'transform: translateX(-50%)',
      'text-align: center',
      'z-index: 10000',
      'opacity: 0',
      'transition: opacity 0.2s ease'
    ].join(';');
    document.body.appendChild(cr);
  }

  cr.innerHTML = '<p>QRA locator &copy; 2026 Fred <a href="https://qrz.com/db/W6BSD/">W6BSD</a><br> ' +
    'inspired by a previous work from F4LEN<br></p>' +
    '<p>Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a><br>' +
    'Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a></p>';

  requestAnimationFrame(function () {
    cr.style.opacity = '1';
    document.addEventListener('click', function() {
      cr.style.opacity = '0';
      setTimeout(() => cr.remove(), 200);
    }, { once: true }); // Removes itself after first click
  });
}

// Self-mutating: reuses one toast element and just resets its timer on
// repeated calls, so rapid clicks don't stack multiple messages.
function showToast(message, duration) {
  duration = duration || 5000;

  var toast = document.getElementById('grid-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'grid-toast';
    toast.style.cssText = [
      'position: fixed',
      'left: 50%',
      'bottom: 30px',
      'transform: translateX(-50%)',
      'background: #114',
      'color: #f80',
      'padding: 10px 18px',
      'border-radius: 6px',
      'font-family: "Menlo", "Consolas", monospace',
      'font-size: 14px',
      'z-index: 10000',
      'opacity: 0',
      'transition: opacity 0.2s ease',
      'pointer-events: none'
    ].join(';');
    document.body.appendChild(toast);
  }

  toast.textContent = message;

  // Restart the fade-in even if a toast is already showing.
  clearTimeout(toast._hideTimer);
  toast.style.opacity = '0';
  requestAnimationFrame(function () {
    toast.style.opacity = '1';
  });

  toast._hideTimer = setTimeout(function () {
    toast.style.opacity = '0';
  }, duration);
}

// ================= Draw Grid square. Adapted from Martin DK3ML =================
// http://dk3ml.de/

function refreshMap() {
  gridLayer.clearLayers();
  labelLayer.clearLayers();
  drawGrid(mymap.getBounds(), mymap.getZoom());
}

// Shared across all grid rectangles: one canvas renderer instead of one
// SVG element per rectangle (there can be hundreds at deep zoom), and one
// reused style object instead of allocating a new one every iteration.
var gridRenderer = L.canvas({ padding: 0.5 });
var gridStyle = { color: "#0000ff", weight: 1, fill: false, renderer: gridRenderer };

// Iterates v = start, start+step, start+2*step, ... while v < end.
function forRange(start, end, step, callback) {
  for (var v = start; v < end; v += step) {
    callback(v);
  }
}

// Draws one grid cell (rectangle) and its label.
function addGridCell(swLat, swLon, neLat, neLon, labelLon, labelLat, precision, zoom) {
  gridLayer.addLayer(L.rectangle([[swLat, swLon], [neLat, neLon]], gridStyle));
  labelLayer.addLayer(getLabel(labelLon, labelLat, precision, zoom));
}

function getLocator(lon, lat, precision) {
  var locator = "";
  var x = lon;
  var y = lat;

  while (x < -180) { x += 360; }
  while (x > 180) { x -= 360; }

  x = x + 180;
  y = y + 90;

  locator += d1[Math.floor(x / 20)] + d1[Math.floor(y / 10)];

  var rlon, rlat;
  if (precision > 1) {
    rlon = x % 20;
    rlat = y % 10;
    locator += Math.floor(rlon / 2) + "" + Math.floor(rlat / 1);
  }

  if (precision > 2) {
    rlon = rlon % 2;
    rlat = rlat % 1;
    locator += d2[Math.floor(rlon / (2 / 24))] + "" + d2[Math.floor(rlat / (1 / 24))];
  }

  return locator;
}

// Helper function to get only the first 6 characters of a locator
function getShortLocator(locator) {
  if (!locator) return "";
  return locator.substring(0, 6);
}

// Label font size by zoom level. Zoom ranges never overlap between
// precisions (1-5 = field, 6-9 = square, 10+ = subsquare), so a single
// flat lookup keyed by zoom replaces the old three-way switch/if-chain.
// LABEL_SIZE_FALLBACK covers zoom >= 13, which the original switch handled
// via a "default" case that only existed inside the precision === 3 branch.
var LABEL_SIZES_BY_ZOOM = {
  1: 2, 2: 3, 3: 5, 4: 10, 5: 14,   // precision 1 (field)
  6: 3, 7: 3, 8: 5, 9: 10,          // precision 2 (square)
  10: 1, 11: 3, 12: 5               // precision 3 (subsquare)
};
var LABEL_SIZE_DEFAULT = 1;
var LABEL_SIZE_FALLBACK = 9; // zoom >= 13 at precision 3

function getLabelSize(precision, zoom) {
  if (zoom in LABEL_SIZES_BY_ZOOM) {
    return LABEL_SIZES_BY_ZOOM[zoom];
  }
  return precision === 3 ? LABEL_SIZE_FALLBACK : LABEL_SIZE_DEFAULT;
}

function getLabel(lon, lat, precision, zoom) {
  var labelSize = getLabelSize(precision, zoom);

  var fullLocator = getLocator(lon, lat, precision);
  var shortLocator = getShortLocator(fullLocator);

  // Get the stored locator safely
  var storedLocator = sessionStorage.getItem('Myloc') || "";
  var isMyLoc = shortLocator === getShortLocator(storedLocator);

  var myIcon = L.divIcon({
    className: isMyLoc ? 'select-box-label' : 'box-label',
    html: '<font size="' + labelSize + '">' + shortLocator + '</font>'
  });

  return L.marker([lat, lon], { icon: myIcon, interactive: false });
}

// Computes the tile boundary (snapped to a lonStep x latStep grid) that
// covers the given map bounds, clamped to +-85 latitude. Shared by all
// three drawGrid levels since they all do the same snap-and-clamp step,
// just with different step sizes.
function computeGridBounds(bounds, lonStep, latStep) {
  var n = Math.min(bounds.getNorth(), 85);
  var s = Math.max(bounds.getSouth(), -85);
  var w = bounds.getWest();
  var e = bounds.getEast();

  return {
    left: Math.floor(w / lonStep) * lonStep,
    right: Math.ceil(e / lonStep) * lonStep,
    top: Math.ceil(n / latStep) * latStep,
    bottom: Math.floor(s / latStep) * latStep
  };
}

// Field-level grid: 20deg lon x 10deg lat cells.
function drawFieldGrid(bounds, zoom) {
  var lonStep = 20, latStep = 10;
  var b = computeGridBounds(bounds, lonStep, latStep);

  forRange(b.left, b.right, lonStep, function (lon) {
    forRange(b.bottom, b.top, latStep, function (lat) {
      addGridCell(lat, lon, lat + latStep, lon + lonStep, lon + 8, lat + 6, 1, zoom);
    });
  });
}

// Square-level grid: 2deg lon x 1deg lat cells.
function drawSquareGrid(bounds, zoom) {
  var lonStep = 2, latStep = 1;
  var b = computeGridBounds(bounds, lonStep, latStep);

  forRange(b.left, b.right, lonStep, function (lon) {
    forRange(b.bottom, b.top, latStep, function (lat) {
      addGridCell(lat, lon, lat + latStep, lon + lonStep, lon + 0.9, lat - 0.5, 2, zoom);
    });
  });
}

// Subsquare-level grid: same 2deg x 1deg cells as drawSquareGrid, each
// further split into a 24x24 grid of subsquares.
function drawSubsquareGrid(bounds, zoom) {
  var lonStep = 2, latStep = 1;
  var b = computeGridBounds(bounds, lonStep, latStep);
  var subLonStep = lonStep / 24;
  var subLatStep = latStep / 24;

  forRange(b.left, b.right, lonStep, function (lon) {
    forRange(b.bottom, b.top, latStep, function (lat) {
      // Integer-indexed rather than accumulating slon/slat by += so
      // there's no floating point drift across 24 iterations.
      for (var i = 0; i < 24; i++) {
        var slon = lon + i * subLonStep;
        for (var j = 0; j < 24; j++) {
          var slat = lat + j * subLatStep;
          addGridCell(
            slat, slon, slat + subLatStep, slon + subLonStep,
            slon + (0.8 / 24), slat + (1 / 48), 3, zoom
          );
        }
      }
    });
  });
}

function drawGrid(bounds, zoom) {
  if (zoom < 6) {
    drawFieldGrid(bounds, zoom);
  } else if (zoom < 10) {
    drawSquareGrid(bounds, zoom);
  } else {
    drawSubsquareGrid(bounds, zoom);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var searchInput = document.getElementById('newloc');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.keyCode === 13) {
        locate();
        e.preventDefault();
      }
    });
  }
  var infoModal = document.querySelector('.info');
  if (infoModal) {
    infoModal.addEventListener('click', function(e) {
      showCopyright(e);
    e.preventDefault();
    });
  }
});


// Helper function to format numbers with 5 decimal places, padded if necessary
function formatCoordinate(value) {
  var rounded = Math.round(value * 100000) / 100000;
  return rounded.toFixed(5);
}

function updateInfo(lat, lon) {
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  var fullLocator = latlon2loc(lat, lon);
  var shortLocator = getShortLocator(fullLocator);

  var latDisplay = formatCoordinate(lat);
  var lonDisplay = formatCoordinate(lon);

  document.getElementById('lat').innerHTML = latDisplay;
  document.getElementById('lon').innerHTML = lonDisplay;
  document.getElementById('myloc').innerHTML = shortLocator;
}

async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      (error) => reject(error)
    );
  });
}


// ===================== Map init =====================
var mymap;
var gridLayer;
var labelLayer;
var d1 = "ABCDEFGHIJKLMNOPQR".split("");
var d2 = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");

async function map_init() {
  var Myloc = sessionStorage.getItem('Myloc');
  var zoomLevel = sessionStorage.getItem('zoomLevel');

  if (Myloc == null || Myloc === "") {
    try {
      const coords = await getCurrentLocation();
      if (coords) {
        Myloc = latlon2loc(coords.lat, coords.lon);
      } else {
        Myloc = 'CM87VL';
      }
    } catch (error) {
      console.error("Location error:", error);
      Myloc = 'CM87VL';
    }
    zoomLevel = 5;
  }

  var geo = loc2latlon(Myloc);
  var mylat = geo.lat;
  var mylon = geo.lon;
  updateInfo(mylat, mylon);

  mymap = L.map('mapid').setView([mylat, mylon], zoomLevel);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
    '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
    'Imagery © <a href="https://www.mapbox.com/">Mapbox</a> - ' +
    '<a href="https://qrz.com/db/W6BSD/">Fred W6BSD</a>',
    id: 'mapbox.streets'
  }).addTo(mymap);
  L.control.scale().addTo(mymap);

  var results = L.layerGroup().addTo(mymap);

  // Grids
  gridLayer = new L.LayerGroup({ zIndex: 500 }).addTo(mymap);
  labelLayer = new L.LayerGroup().addTo(mymap);
  drawGrid(mymap.getBounds(), mymap.getZoom());

  mymap.on('mousemove', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;
    updateInfo(lat, lon);
  });

  mymap.on("moveend", function () {
    refreshMap();
  });

  mymap.on('click', function (e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;
    var fullLocator = latlon2loc(lat, lon);
    var shortLocator = getShortLocator(fullLocator);
    var str = formatCoordinate(lat) + ", " + formatCoordinate(lon);
    navigator.clipboard.writeText(str);
    showToast('GPS coordinates "' + str + '" copied to the clipboard');
  });
}


map_init();
