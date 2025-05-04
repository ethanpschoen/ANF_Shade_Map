mapboxgl.accessToken = "pk.eyJ1IjoiZXNjaG9lbiIsImEiOiJjbTlucmdscXYwMWh3MmxweWltYzZoamcxIn0.ErbvkzyaFrxy8UuFqT10tQ";

const bounds = [
  [-118.89, 34.11], // Southwest coordinates
  [-117.15, 34.83]   // Northeast coordinates
];

// Declare instance of mapbox map
const map = new mapboxgl.Map({
  container: 'map-placeholder', // HTML element to contain the map
  center: [-117.961, 34.326], // Angeles National Forest
  zoom: 10, 
  style: 'mapbox://styles/mapbox/streets-v11', // Select map style from Mapbox options
  maxBounds: bounds, 
  pitch: 0,
  scrollZoom: {
    around: "center"
  }
});

// Control to allow zooming using buttons on the map, instead of just mouse control
const nav = new mapboxgl.NavigationControl({
  showCompass: false // Visual decision to hide compass on map
});
map.addControl(nav);

let shadeMap; // Declaring variable for shademap
let selectedDate; // Store the selected date
let currentPopup = null; // Store reference to current popup

// Event listener for when map is loaded
map.on('load', () => {
  selectedDate = new Date(); // This returns a Date object for the current time (when loaded)
  
  // Load trail names for auto-fill from geojson file
  fetch('output.geojson')
    .then(response => response.json())
    .then(data => {
      const datalist = document.getElementById('trail-list'); // Connects to html element for search bar
      const uniqueTrailNames = new Set();
      
      // Extract unique trail names from geojson file
      data.features.forEach(feature => {
        if (feature.properties.name) {
          uniqueTrailNames.add(feature.properties.name);
        }
      });

      // Add trail names to datalist which is what appears in the search bar
      uniqueTrailNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
      });
    })
    .catch(error => console.error('Error loading trail names:', error));

  // Add search functionality using built-in search widgets
  const searchButton = document.getElementById('search-button');
  const searchInput = document.getElementById('trail-input');
  
  // Event listener for when search button is clicked
  searchButton.addEventListener('click', () => {
    const searchQuery = searchInput.value.trim().toLowerCase();
    
    // Check if search is empty
    if (!searchQuery) {
      alert("Please enter a search query");
      return;
    }

    // If there is already a layer (trail) on the map, remove it before loading a new one
    if (map.getLayer('geojson-layer')) {
      map.removeLayer('geojson-layer');
      map.removeSource('geojson-data');
    }

    // Load and search the GeoJSON file
    fetch('output.geojson')
      .then(response => response.json())
      .then(data => {
        // Find matching trail (handling case sensitivity)
        const matchingFeature = data.features.find(feature => 
          feature.properties.name.toLowerCase() === searchQuery.toLowerCase()
        );
        
        // If trail name is not found, prompt user to search again
        if (!matchingFeature) {
          alert("No matching trail found. Please check the name and try again.");
          return;
        }

        // Create a new GeoJSON with only the matching feature
        const filteredGeoJSON = {
          type: 'FeatureCollection',
          features: [matchingFeature]
        };

        // Add the filtered data as a source
        map.addSource('geojson-data', {
          type: 'geojson',
          data: filteredGeoJSON
        });

        // Add the layer
        map.addLayer({
          id: 'geojson-layer',
          type: 'line',
          source: 'geojson-data',
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#000000", "line-width": 2 }
        });

        // Remove existing popup from previous trail search (trail length, search link) if it exists
        if (currentPopup) {
          currentPopup.remove();
        }

        // Show popup with trail information (length, name, google search link)
        const properties = matchingFeature.properties;
        const meter_distance = properties.distance; // This distance was calculated in meters...
        const miles_distance = meter_distance ? (meter_distance * 0.000621371).toFixed(2) : null; // Then converted to miles for display
        const distance = miles_distance ? `${miles_distance} miles` : 'Distance not available';
        const trailName = properties.name || 'Unnamed Trail';
        // Google search URL with Angeles National Forest context
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(trailName + ' Angeles National Forest trail')}`;
        
        // Get the center of the trail for popup placement
        const coordinates = matchingFeature.geometry.coordinates;
        const centerIndex = Math.floor(coordinates.length / 2);
        const centerCoord = coordinates[centerIndex];
        
        // Place popup on the map
        currentPopup = new mapboxgl.Popup()
          .setLngLat(centerCoord)
          .setHTML(`
            <div style="color: #333; font-family: Arial, sans-serif;">
              <strong style="color: #088; font-size: 16px;">${trailName}</strong><br>
              <span style="color: #666;">Distance: ${distance}</span><br>
              <a href="${searchUrl}" target="_blank" style="color: #088; text-decoration: none;">
                Search for more trail information
              </a>
            </div>
          `)
          .addTo(map);

        // Fit map to the bounds of the matching feature
        const bounds = coordinates.reduce((bounds, coord) => {
          bounds.extend(coord);
          return bounds;
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, { padding: 50 });
      })
      .catch(error => console.error('Error loading GeoJSON:', error));
  });

  // Load the shade map, as directed by the API documentation
  shadeMap = new ShadeMap({
    date: selectedDate,    // Display shadows for current date
    color: '#01112f',    // Shade color
    opacity: 0.7,        // Opacity of shade color
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
  
  // Disabled innate feature which allowed user to rotate the map 
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  // Set map zoom to itself, forces shade to show up on map
  setTimeout(() => {
    map.setZoom(map.getZoom());
  }, 10);
});

// External control for time slider and date picker
const timeSlider = document.getElementById('time-slider'); // Note: the time slider is set for 5 minute time intervals
const timeInput = document.getElementById('time-input');
const datePicker = document.getElementById('date-picker');

// Set initial time display and slider position to current time
var now = new Date();
var currentMinutes = now.getHours() * 60 + now.getMinutes();
var currentValue = Math.round(currentMinutes / 5); // Convert to 5-minute intervals
timeSlider.value = currentValue;

// Set date as current date
const dateOffset = new Date(now.getTime() - now.getTimezoneOffset() * 60000); // Offset needed to convert to UTC time since date picker is in UTC
datePicker.valueAsDate = now;
// Format time for time input (HH:MM)
var hours = now.getHours().toString().padStart(2, '0');
var minutes = now.getMinutes().toString().padStart(2, '0');
timeInput.value = `${hours}:${minutes}`;

// Function to update the display time/date on the map when user changes time/date input
function updateTimeFromMinutes(totalMinutes) {
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  
  // Update time input
  var inputHours = hours.toString().padStart(2, '0');
  var inputMinutes = minutes.toString().padStart(2, '0');
  timeInput.value = `${inputHours}:${inputMinutes}`;
  
  if (shadeMap) {
    // Create new date object and reassign to selectedDate, needed for proper rendering since otherwise no change is detected
    const newDate = new Date(selectedDate);
    newDate.setHours(hours);
    newDate.setMinutes(minutes);
    selectedDate = newDate;
    shadeMap.setDate(selectedDate);
    // console.log("Updated shade map time to:", selectedDate);
  }
}

// Event listener for changing time based on sliding the slider
timeSlider.addEventListener('input', function() {
  var totalMinutes = parseInt(this.value) * 5; // Convert slider value to minutes
  updateTimeFromMinutes(totalMinutes);
});

// Event listener for changing time based on inut
timeInput.addEventListener('input', function() {
  const [hours, minutes] = this.value.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  timeSlider.value = Math.round(totalMinutes / 5);
  updateTimeFromMinutes(totalMinutes);
});

// Event listener for changing date
datePicker.addEventListener('input', function() {
  if (shadeMap) {
    const inputDate = new Date(this.value);
    const newDate = new Date(inputDate.getTime() + inputDate.getTimezoneOffset() * 60000); // Offset needed to convert to UTC time since date picker is in UTC
    
    newDate.setHours(selectedDate.getHours());
    newDate.setMinutes(selectedDate.getMinutes());

    selectedDate = newDate;
    
    shadeMap.setDate(selectedDate);
    // console.log("Updated shade map date to:", selectedDate);
  }
}); 