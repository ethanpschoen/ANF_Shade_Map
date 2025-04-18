mapboxgl.accessToken = "pk.eyJ1IjoiZXNjaG9lbiIsImEiOiJjbTdiMmNlZjMwOHd5MmpwdTNiaGJ6eGVuIn0.Y9yNK2bpxmADMIHptRQgPw";

const bounds = [
  [-118.798, 34.138], // Southwest coordinates
  [-117.318, 34.768]   // Northeast coordinates
];

const map = new mapboxgl.Map({
  container: 'map-placeholder',
  center: [-117.961, 34.326], // Angeles National Forest
  zoom: 10,
  style: 'mapbox://styles/mapbox/streets-v11',
  maxBounds: bounds,
  pitch: 0,
  scrollZoom: {
    around: "center"
  }
});

let shadeMap;
let selectedDate; // Store the selected date

map.on('load', () => {
  console.log("0. Map loaded");
  selectedDate = new Date();

  console.log("1. Selected date after map load:", selectedDate);
  
  shadeMap = new ShadeMap({
    date: selectedDate,    // display shadows for current date
    color: '#01112f',    // shade color
    opacity: 0.7,        // opacity of shade color
    apiKey: "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImVzY2hvZW5Ab3h5LmVkdSIsImNyZWF0ZWQiOjE3MzgzNzIyNjU3MDIsImlhdCI6MTczODM3MjI2NX0.Q6OYzdDPi2Ky256BaXqFIWUjseVsio9_QboTejYxleI",    // obtain from https://shademap.app/about/
    terrainSource: {
      tileSize: 256,       // DEM tile size
      maxZoom: 15,         // Maximum zoom of DEM tile set
      getSourceUrl: ({ x, y, z }) => {
        return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      },
      getElevation: ({ r, g, b, a }) => {
        return (r * 256 + g + b / 256) - 32768;
      }
    },
    debug: (msg) => { console.log(new Date().toISOString(), msg); },
  }).addTo(map);
  console.log("2. Shade map added to map");
  
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  setTimeout(() => {
    map.setZoom(map.getZoom());
    console.log("3. Map set to zoom after waiting");
  }, 10);
  
  fetch('trails.json')
  .then(response => response.json())
  .then(trails => {
    const datalist = document.getElementById('trail-list');
    trails.forEach(trail => {
      const option = document.createElement('option');
      option.value = trail.name;
      datalist.appendChild(option);
    });

    // Add search functionality
    document.getElementById('search-button').addEventListener('click', () => {
      const trailInput = document.getElementById('trail-input').value.trim();

      if (!trailInput) {
        alert("Please enter a trail name.");
        return;
      }
      
      function normalizeTrailName(name) {
          return name.toLowerCase();
      }

      // Find the closest matching trail
      const matchedTrail = trails.find(trail =>
        normalizeTrailName(trail.name).includes(normalizeTrailName(trailInput))
      );

      if (!matchedTrail) {
        alert("Trail not found. Please check the name and try again.");
        return;
      }

      const gpxPath = matchedTrail.file;  // Use the 'file' property
      console.log("Fetching GPX file from:", gpxPath);

      // Load and display the selected GPX trail
      fetch(gpxPath)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.text();
        })
        .then(gpxData => {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(gpxData, "application/xml");
          const geojson = toGeoJSON.gpx(xmlDoc);

          // Remove existing trail if present
          if (map.getLayer("trail-layer")) {
            map.removeLayer("trail-layer");
            map.removeSource("trail");
          }

          // Add the new trail to the map
          map.addSource("trail", { type: "geojson", data: geojson });
          map.addLayer({
            id: "trail-layer",
            type: "line",
            source: "trail",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#000000", "line-width": 2 }
          });

          // Zoom to the trail
          if (geojson.features.length > 0) {
            const coordinates = geojson.features[0].geometry.coordinates;
            map.fitBounds(
              coordinates.reduce((bounds, coord) => bounds.extend(coord), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])),
              { padding: 50 }
            );
          }
        })
        .catch(error => {
            console.error("Error loading GPX file:", error);
            alert("Failed to load trail data.");
        });
    });
  })
.catch(error => console.error("Error loading trails list:", error));
});

// External control for time slider
const timeSlider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');

// Set initial time display and slider position to current time
var now = new Date();
var currentMinutes = now.getHours() * 60 + now.getMinutes();
var currentValue = Math.round(currentMinutes / 5); // Convert to 5-minute intervals
timeSlider.value = currentValue;

var displayHours = now.getHours() % 12 || 12;
var displayMinutes = now.getMinutes();
var ampm = now.getHours() >= 12 ? 'PM' : 'AM';
timeDisplay.innerHTML = displayHours + ':' + (displayMinutes < 10 ? '0' : '') + displayMinutes + ' ' + ampm;

timeSlider.addEventListener('input', function() {
  var totalMinutes = parseInt(this.value) * 5; // Convert slider value to minutes
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  var ampm = hours >= 12 ? 'PM' : 'AM';
  var displayHours = hours % 12 || 12;
  timeDisplay.innerHTML = displayHours + ':' + (minutes < 10 ? '0' : '') + minutes + ' ' + ampm;
  if (shadeMap) {
    const newDate = new Date(selectedDate);

    newDate.setHours(hours);
    newDate.setMinutes(minutes);

    selectedDate = newDate;

    shadeMap.setDate(selectedDate);
    console.log("Updated shade map time to:", selectedDate);
  }
});

const datePickerToggle = document.getElementById('date-picker-toggle');
const datePicker = document.getElementById('date-picker');

datePickerToggle.addEventListener('click', () => {
    datePicker.style.display = (datePicker.style.display === 'none' || datePicker.style.display === '') ? 'block' : 'none';
});

datePicker.addEventListener('input', function() {
  if (shadeMap) {
    const inputDate = new Date(this.value);
    const newDate = new Date(inputDate.getTime() + inputDate.getTimezoneOffset() * 60000);
    
    newDate.setHours(selectedDate.getHours());
    newDate.setMinutes(selectedDate.getMinutes());

    selectedDate = newDate;
    
    shadeMap.setDate(selectedDate);
    console.log("Updated shade map date to:", selectedDate);
  }
}); 