// Map Configuration Constants
const INITIAL_CENTER = [23, 113.3];
const INITIAL_ZOOM = 7;
const CARTODB_POSITRON_URL_TEMPLATE = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const CARTODB_DARKMATTER_URL_TEMPLATE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CITIES_DATA_PATH = './assets/geojson/areas.json';
const POINTS_DATA_PATH = './assets/geojson/points.json';

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const mapDiv = document.getElementById('map');

// Initialize map
const map = L.map('map', { attributionControl: false }).setView(INITIAL_CENTER, INITIAL_ZOOM);
let geojsonLayer; // To store the main GeoJSON layer

// Base Layers
const baseLayers = {
    "高德地图": L.tileLayer.chinaProvider('GaoDe.Normal.Map'), // Add default base layer to map
    "高德影像": L.layerGroup([
        L.tileLayer.chinaProvider('GaoDe.Satellite.Map'),
        L.tileLayer.chinaProvider('GaoDe.Satellite.Annotion')
    ]),
    "Google地图": L.tileLayer.chinaProvider('Google.Normal.Map'),
    "Google影像": L.tileLayer.chinaProvider('Google.Satellite.Map'),
    "CartoDB Positron": L.tileLayer(CARTODB_POSITRON_URL_TEMPLATE, { subdomains: "abcd" }),
    "CartoDB Dark Matter": L.tileLayer(CARTODB_DARKMATTER_URL_TEMPLATE, { subdomains: "abcd" })
};

// Overlay Layers (if any)
const overlayLayers = {
    // Add any overlay layers if needed
};

// Add Layer Control
L.control.layers(baseLayers, overlayLayers, { position: "bottomright", collapsed: true }).addTo(map);

baseLayers["高德地图"].addTo(map);

// Add Scale Control
L.control.scale({
    position: 'bottomleft',
    maxWidth: 100, // Max width of the scale control in pixels
    imperial: false // Use metric units
}).addTo(map);

L.control.locate({position: 'topleft'}).addTo(map);

// Information Control (displays data on hover)
const infoControl = L.control();

infoControl.onAdd = function (mapInstance) {
    this._div = L.DomUtil.create('div', 'info'); // Create a div with a class "info"
    this.update();
    return this._div;
};

infoControl.update = function (props) {
    this._div.innerHTML = '<h4>照片拍摄数量</h4>' + // Changed title to Chinese for consistency
        (props ?
            '<b>' + props.name + '</b><br />' + (props.pointCount !== undefined ? props.pointCount : '0') + ' 张'
            : '将鼠标悬停在城市上');
};
infoControl.addTo(map);


// GeoJSON Styling and Interaction Functions
function getColor(count) {
    // Colors from dark blue to light blue based on count. Transparent if no count.
    return count > 1000 ? '#023858' :  // 最深蓝
        count > 500  ? '#045a8d' :  // 暗蓝
            count > 100  ? '#0570b0' :  // 深海蓝
                count > 50   ? '#3690c0' :  // 中蓝
                    count > 20   ? '#74a9cf' :  // 浅蓝
                        count > 0    ? '#a6bddb' :  // 灰蓝
                            '#00000000'; // 透明 (Transparent)
}

function styleFeature(feature) {
    return {
        fillColor: getColor(feature.properties.pointCount),
        weight: 1,
        opacity: 1,
        color: '#66666633', // Semi-transparent grey border
        dashArray: '',
        fillOpacity: 0.8
    };
}

function highlightFeature(e) {
    const layer = e.target;
    layer.setStyle({
        weight: 3,
        color: '#666666AA', // More opaque grey for highlight
        dashArray: '',
        fillOpacity: 0.4 // More transparent fill on highlight
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
    infoControl.update(layer.feature.properties);
}

function resetHighlight(e) {
    if (geojsonLayer) {
        geojsonLayer.resetStyle(e.target);
    }
    infoControl.update();
}

function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
}

function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

// Function to display error message on the map
function displayError(message) {
    if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator
    mapDiv.innerHTML = `<div class="map-error-message">${message}</div>`;
}

// Load and process data
Promise.all([
    fetch(CITIES_DATA_PATH).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${CITIES_DATA_PATH}`);
        }
        return response.json();
    }),
    fetch(POINTS_DATA_PATH).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${POINTS_DATA_PATH}`);
        }
        return response.json();
    })
])
    .then(function ([regionsData, pointsData]) {
        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator

        // Convert points to Turf.js feature collection
        let turfPoints = turf.featureCollection(pointsData.features);

        // Count points in each region
        regionsData.features.forEach(function (region) {
            // Ensure region geometry is valid for Turf.js
            if (region.geometry && (region.geometry.type === "Polygon" || region.geometry.type === "MultiPolygon")) {
                let regionPolygon = turf.feature(region.geometry); // Use turf.feature for safety
                let pointsWithin = turf.pointsWithinPolygon(turfPoints, regionPolygon);
                region.properties.pointCount = pointsWithin.features.length;
            } else {
                region.properties.pointCount = 0; // Or handle as an error/warning
                console.warn("Skipping region with invalid or missing geometry:", region.properties.name || "Unknown region");
            }
        });

        // Add the GeoJSON layer to the map
        geojsonLayer = L.geoJson(regionsData, {
            style: styleFeature,
            onEachFeature: onEachFeature,
            renderer: L.canvas() // Use canvas renderer for better performance with many features
        }).addTo(map);

    })
    .catch(error => {
        console.error('Failed to load map data:', error);
        displayError('加载地图数据失败，请检查数据文件或网络连接后重试。');
    });

// This event listener resets the style of each layer on zoom end.
// It can be useful if styles are dynamically calculated based on zoom,
// or to fix potential rendering issues after zoom.
// If your style function (styleFeature) does not depend on zoom level,
// this might be redundant, but often kept as a precaution.
map.on('zoomend', function () {
    if (geojsonLayer) {
        geojsonLayer.eachLayer(function (layer) {
            geojsonLayer.resetStyle(layer);
        });
    }
});

// Optional: Code for displaying individual points (from original commented block)
// This section is kept separate and would need further integration if enabled.
/*
function setupPointsDisplay(pointsDataGeoJson) {
    const pointsLayer = L.geoJson(pointsDataGeoJson, {
        pointToLayer: function (feature, latlng) {
            let styleOptions = {
                radius: 5, // Initial radius, adjust as needed
                stroke: false,
                fillColor: '#bdc3c7', // Default color
                fillOpacity: 0.5,
                fillRule: 'nonzero',
                interactive: false
            };

            const timestamp = feature.properties.timestamp;
            if (timestamp) {
                const date = new Date(timestamp);
                const year = date.getFullYear();

                // Define different styles based on timestamp year
                switch (year) {
                    case 2016: styleOptions.fillColor = '#2ecc71'; break;
                    case 2017: styleOptions.fillColor = '#3498db'; break;
                    case 2018: styleOptions.fillColor = '#2980b9'; break;
                    case 2019: styleOptions.fillColor = '#9b59b6'; break;
                    case 2020: styleOptions.fillColor = '#8e44ad'; break;
                    case 2021: styleOptions.fillColor = '#f1c40f'; break;
                    case 2022: styleOptions.fillColor = '#f39c12'; break;
                    case 2023: styleOptions.fillColor = '#e67e22'; break;
                    case 2024: styleOptions.fillColor = '#d35400'; break;
                    default: styleOptions.fillColor = '#bdc3c7'; break;
                }
            }
            return L.circle(latlng, styleOptions);
        },
        renderer: L.canvas()
    }).addTo(map);

    map.on('zoomend', function () {
        const zoomLevel = map.getZoom();
        // Example: Adjust radius based on zoom. This formula might need tweaking.
        // const baseRadius = 7389;
        // const decayRate = 0.3;
        // const currentRadius = baseRadius * Math.exp(-decayRate * zoomLevel);
        // More simply:
        let currentRadius = 5; // Default
        if (zoomLevel < 5) currentRadius = 2;
        else if (zoomLevel < 8) currentRadius = 5;
        else if (zoomLevel < 10) currentRadius = 8;
        else currentRadius = 10;


        pointsLayer.eachLayer(layer => {
            if (layer.setRadius) { // Ensure it's a circle marker
                layer.setRadius(currentRadius);
            }
        });
    });
}

// To use the above, you would call setupPointsDisplay(pointsData) inside the .then() block
// after pointsData is loaded, e.g.:
// .then(function ([regionsData, pointsData]) {
//     ...
//     setupPointsDisplay(pointsData); // pointsData here is the raw GeoJSON from fetch
//     ...
// });
*/
