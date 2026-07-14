// ===================== Maidenhead locator <-> lat/lon =====================

const FIELD_CHARS = "ABCDEFGHIJKLMNOPQR";
const SUBSQUARE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWX";

// Label font size by zoom level.
const LABEL_SIZES_BY_ZOOM = {
  1: 2,
  2: 3,
  3: 5,
  4: 5,
  5: 8,
  6: 8,
  7: 3,
  8: 5,
  9: 10,
  10: 2,
  11: 3,
  12: 5,
  13: 8
};
const LABEL_SIZE_DEFAULT = 3;
const LABEL_SIZE_FALLBACK = 12; // zoom >= 13 at precision 3

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

function getLocator(lon, lat, precision) {
  var x = lon;
  var y = lat;

  // Handle world wrap-around safely
  while (x < -180) { x += 360; }
  while (x > 180) { x -= 360; }

  x = x + 180;
  y = y + 90;

  // --- Level 1: Field ---
  var fieldLngIdx = Math.floor(x / 20);
  var fieldLatIdx = Math.floor(y / 10);

  // Guard against array overflow at absolute map boundaries
  if(fieldLngIdx > 17) fieldLngIdx = 17;
  if(fieldLatIdx > 17) fieldLatIdx = 17;

  var locator = FIELD_CHARS[fieldLngIdx] + FIELD_CHARS[fieldLatIdx];

  // --- Level 2: Square ---
  var rlon, rlat;
  if (precision > 1) {
    rlon = x - (fieldLngIdx * 20);
    rlat = y - (fieldLatIdx * 10);
    locator += Math.floor(rlon / 2) + "" + Math.floor(rlat / 1);
  }

  // --- Level 3: Subsquare ---
  if (precision > 2) {
    var remSubLng = rlon - (Math.floor(rlon / 2) * 2);
    var remSubLat = rlat - (Math.floor(rlat / 1) * 1);

    var subLngIdx = Math.floor(remSubLng / (2 / 24));
    var subLatIdx = Math.floor(remSubLat / (1 / 24));

    if(subLngIdx > 23) subLngIdx = 23;
    if(subLatIdx > 23) subLatIdx = 23;

    locator += SUBSQUARE_CHARS[subLngIdx] + SUBSQUARE_CHARS[subLatIdx];
  }

  return locator;
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
function goToLocator(rawValue, shouldReload) {
  var newloc = rawValue.toUpperCase();
  var isSixChar = /^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(newloc);
  var isFourChar = /^[A-R]{2}[0-9]{2}$/.test(newloc);

  if (isSixChar) {
    localStorage.setItem('Myloc', newloc);
    localStorage.setItem('zoomLevel', 13);
  } else if (isFourChar) {
    localStorage.setItem('Myloc', newloc + 'LL');
    localStorage.setItem('zoomLevel', 9);
  } else {
    alert(`Wrong value: ${rawValue}. Valid format should be AA00 or AA00AA`);
    return;
  }

  if (shouldReload) {
    updateMapToNewLocator(newloc);
  }
}

function updateMapToNewLocator(locator) {
  var storedLocator = localStorage.getItem('Myloc');
  var zoomLevel = parseInt(localStorage.getItem('zoomLevel')) || 13;

  var geo = loc2latlon(storedLocator);
  if (!geo) return;

  var mylat = geo.lat;
  var mylon = geo.lon;

  if (mymap) {
    mymap.setView([mylat, mylon], zoomLevel);
    updateInfo(mylat, mylon);

    // Refresh the grid layers
    if (gridLayer && labelLayer) {
      gridLayer.clearLayers();
      labelLayer.clearLayers();
      drawGrid(mymap.getBounds(), mymap.getZoom());
    }
  }

  var searchInput = document.getElementById('newloc');
  if (searchInput) {
    searchInput.value = locator;
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

function showCopyright() {
  var cr = document.getElementById('copyright');

  requestAnimationFrame(function () {
    cr.style.opacity = '1';
    document.addEventListener('click', function() {
      cr.style.opacity = '0';
    }, { once: true });
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
    toast.className = 'grid-toast';
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
  labelLayer.clearLayers();
  gridLayer.clearLayers();
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

// Helper function to get only the first 6 characters of a locator
function getShortLocator(locator) {
  if (!locator) return "";
  return locator.substring(0, 6);
}

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
  var storedLocator = localStorage.getItem('Myloc') || "";
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

function drawSubsquareGrid(bounds, zoom) {
  var lonStep = 2, latStep = 1;
  var b = computeGridBounds(bounds, lonStep, latStep);
  var subLonStep = lonStep / 24;
  var subLatStep = latStep / 24;

  // Only draw labels if we're zoomed in deep enough to care
  var showLabels = zoom >= 10;

  forRange(b.left, b.right, lonStep, function (lon) {
    forRange(b.bottom, b.top, latStep, function (lat) {
      for (var i = 0; i < 24; i++) {
        var slon = lon + i * subLonStep;
        for (var j = 0; j < 24; j++) {
          var slat = lat + j * subLatStep;

          gridLayer.addLayer(L.rectangle(
            [[slat, slon], [slat + subLatStep, slon + subLonStep]],
            gridStyle)
          );

          if (showLabels) {
            labelLayer.addLayer(getLabel(slon + (0.8 / 24), slat + (1 / 48), 3, zoom));
          }
        }
      }
    });
  });
}

function drawGrid(bounds, zoom) {
  console.log(`Zoom Level: ${zoom}`);
  if (zoom < 7) {
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
  var infoModal = document.getElementById('about');
  if (infoModal) {
    infoModal.addEventListener('click', function(e) {
      showCopyright(e);
      e.preventDefault();
    });
  }
  var crosshair = document.getElementById('crosshair');
  if (crosshair) {
    crosshair.addEventListener('click', function(e) {
      showToast('Getting the location from the GPS', 1250);
      var location = getCurrentLocation();
      location.then((coords) => {
        if (!coords) return;
        newloc = getMaidenheadLocator(coords.lat, coords.lon);
        goToLocator(newloc, true);
      });
      location.catch((error) => {
        console.error("getCurrentLocation error:", error);
        if (error.code === error.TIMEOUT) {
          alert("Geolocation timed out, staying on default view.");
        } else if (error.code === error.PERMISSION_DENIED) {
          alert("Geolocation permission denied.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          alert("Geolocation not available on this device.");
        } else {
          alert("Location error:", error);
        }
      });
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

  var fullLocator = getMaidenheadLocator(lat, lon);
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
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

// Maidenhead Locator Generator
function getMaidenheadLocator(lat, lon, precision = 3) {
  let lngAdjusted = lon + 180;
  let latAdjusted = lat + 90;

  // Handle edge case wrap-arounds
  while (lngAdjusted < 0) { lngAdjusted += 360; }
  while (lngAdjusted > 360) { lngAdjusted -= 360; }

  // --- LEVEL 1: Fields (20° Longitude x 10° Latitude) ---
  let fieldLngIdx = Math.floor(lngAdjusted / 20);
  let fieldLatIdx = Math.floor(latAdjusted / 10);
  let locator = FIELD_CHARS[fieldLngIdx] + FIELD_CHARS[fieldLatIdx];

  if (precision > 1) {
    // --- LEVEL 2: Squares (2° Longitude x 1° Latitude) ---
    let remLng = lngAdjusted - (fieldLngIdx * 20);
    let remLat = latAdjusted - (fieldLatIdx * 10);

    let squareLngIdx = Math.floor(remLng / 2);
    let squareLatIdx = Math.floor(remLat / 1);
    locator += squareLngIdx + "" + squareLatIdx;

    if (precision > 2) {
      // --- LEVEL 3: Subsquares (5' Longitude x 2.5' Latitude) ---
      let remSubLng = remLng - (squareLngIdx * 2);
      let remSubLat = remLat - (squareLatIdx * 1);

      let subLngIdx = Math.floor(remSubLng / (2 / 24));
      let subLatIdx = Math.floor(remSubLat / (1 / 24));

      locator += SUBSQUARE_CHARS[subLngIdx] + SUBSQUARE_CHARS[subLatIdx];
    }
  }

  return locator;
}

// ===================== Map init =====================
var mymap;
var gridLayer;
var labelLayer;

async function map_init() {
  var allowedZoomLevels = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  var Myloc = localStorage.getItem('Myloc') || 'HN05LL';
  var zoomLevel = localStorage.getItem('zoomLevel') || 3;
  var geo = loc2latlon(Myloc);
  var mylat = geo.lat;
  var mylon = geo.lon;
  updateInfo(mylat, mylon);

  mymap = L.map('mapid', {minZoom: 3, maxZoom: 14}).setView([mylat, mylon], zoomLevel);

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

  // Track the previous zoom level to determine direction
  var previousZoom = mymap.getZoom();

  // Grids
  gridLayer = new L.LayerGroup({ zIndex: 500 }).addTo(mymap);
  labelLayer = new L.LayerGroup().addTo(mymap);
  drawGrid(mymap.getBounds(), mymap.getZoom());

  // Map events
  mymap.on('mousemove', (e) => {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;
    updateInfo(lat, lon);
  });

  mymap.on("moveend", () => {
    refreshMap();
  });

  mymap.on('movestart', () => {
    gridLayer.clearLayers();
    labelLayer.clearLayers();
  });

  mymap.on('zoomend', () => {
    const currentZoom = Math.round(mymap.getZoom());
    if (allowedZoomLevels.includes(currentZoom)) {
      previousZoom = currentZoom;
      return;
    }
    const direction = currentZoom > previousZoom ? 1 : -1;
    const nextAllowed = allowedZoomLevels
      .filter(zoom => direction === 1 ? zoom > currentZoom : zoom < currentZoom)
      .sort((a, b) => direction === 1 ? a - b : b - a)[0];

    if (nextAllowed !== undefined) {
      mymap.setZoom(nextAllowed);
      previousZoom = nextAllowed;
    } else {
      mymap.setZoom(previousZoom);
    }
  });

  var clickTimer = null;
  mymap.on('click', function(e) {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    clickTimer = setTimeout(function() {
      var lat = e.latlng.lat;
      var lon = e.latlng.lng;
      var str = formatCoordinate(lat) + ", " + formatCoordinate(lon);
      navigator.clipboard.writeText(str);
      showToast('GPS coordinates "' + str + '" copied to the clipboard');
      clickTimer = null;
    }, 250);
  });

  mymap.on('dblclick', function(e) {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;
    var fullLocator = getMaidenheadLocator(lat, lon);
    var searchInput = document.getElementById('newloc');
    if (searchInput) {
      searchInput.value = fullLocator;
    }
    goToLocator(fullLocator, true);
  });

}

map_init();
