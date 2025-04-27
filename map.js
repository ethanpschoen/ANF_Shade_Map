mapboxgl.accessToken = "pk.eyJ1IjoiZXNjaG9lbiIsImEiOiJjbTdiMmNlZjMwOHd5MmpwdTNiaGJ6eGVuIn0.Y9yNK2bpxmADMIHptRQgPw";

const bounds = [
  [-118.89, 34.11], // Southwest coordinates
  [-117.15, 34.83]   // Northeast coordinates
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
let currentPopup = null;

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

          if (currentPopup) {
            currentPopup.remove();
          }

          // Zoom to the trail
          if (geojson.features.length > 0) {
            const coordinates = geojson.features[0].geometry.coordinates;
            
            const trailName = matchedTrail.name;

            const dashedName = trailName.replace(/ /g, "-").toLowerCase();
            console.log(dashedName);

            const searchUrl = `https://www.alltrails.com/trail/us/california/${encodeURIComponent(dashedName)}`;
            console.log(searchUrl);

            const centerIndex = Math.floor(coordinates.length / 2);
            console.log(centerIndex);
            const centerCoord = coordinates[centerIndex];
            console.log(centerCoord);

            currentPopup = new mapboxgl.Popup()
              .setLngLat(centerCoord)
              .setHTML(`
                <div style="color: #333; font-family: Arial, sans-serif;">
                  <strong style="color: #088; font-size: 16px;">${trailName}</strong><br>
                  <a href="${searchUrl}" target="_blank" style="color: #088; text-decoration: none;">
                    Search on AllTrails
                  </a>
                </div>
              `)
              .addTo(map);
            
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
const timeInput = document.getElementById('time-input');
const datePicker = document.getElementById('date-picker');

// Set initial time display and slider position to current time
var now = new Date();
var currentMinutes = now.getHours() * 60 + now.getMinutes();
var currentValue = Math.round(currentMinutes / 5); // Convert to 5-minute intervals
timeSlider.value = currentValue;

// Format time for time input (HH:MM)
var hours = now.getHours().toString().padStart(2, '0');
var minutes = Math.floor(now.getMinutes() / 5) * 5; // Round to nearest 5 minutes
minutes = minutes.toString().padStart(2, '0');
timeInput.value = `${hours}:${minutes}`;

function updateTimeFromMinutes(totalMinutes) {
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  
  // Update time input
  var inputHours = hours.toString().padStart(2, '0');
  var inputMinutes = Math.floor(minutes / 5) * 5; // Round to nearest 5 minutes
  inputMinutes = inputMinutes.toString().padStart(2, '0');
  timeInput.value = `${inputHours}:${inputMinutes}`;
  
  if (shadeMap) {
    const newDate = new Date(selectedDate);
    newDate.setHours(hours);
    newDate.setMinutes(minutes);
    selectedDate = newDate;
    shadeMap.setDate(selectedDate);
    console.log("Updated shade map time to:", selectedDate);
  }
}

timeSlider.addEventListener('input', function() {
  var totalMinutes = parseInt(this.value) * 5; // Convert slider value to minutes
  updateTimeFromMinutes(totalMinutes);
});

timeInput.addEventListener('input', function() {
  const [hours, minutes] = this.value.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  timeSlider.value = Math.round(totalMinutes / 5);
  updateTimeFromMinutes(totalMinutes);
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