# Import modules
import xml.etree.ElementTree as ET
import json
import folium
from collections import defaultdict
from geopy.distance import geodesic
import requests
import io
import math

# Define bounding box and highway types
bbox = "-118.798,34.138,-117.318,34.768"
highway_types = "path|track|bridleway"

# Construct the URL
base_url = "http://www.overpass-api.de/api/xapi"
query = f"?way[highway={highway_types}][bbox={bbox}]"
full_url = base_url + query

# Download the data
response = requests.get(full_url)

# Check for success
if response.status_code == 200:
  osm_data = response.text  # This is the XML content
  print("OSM data downloaded!")
else:
  print(f"Failed to download: {response.status_code}")

# Group 'ways' by name, creating a dictionary like {name: [way1, way2, way3]}
def get_ways_by_name(tree):
  root = tree.getroot()

  name_to_elements = defaultdict(list)

  # Make case-insensitive
  name_groups = defaultdict(list)

  # Iterate through each 'way' in XML tree
  for element in root.findall('way'):
    # Find 'name' value
    name_tag = element.find(".//tag[@k='name']")
    if name_tag is not None:
      name = name_tag.attrib['v']
      name_groups[name.lower()].append(name)

      # Generate list of nodes for 'way'
      nodes = [node.attrib['ref'] for node in element.findall('nd')]
      # Remove 'way's with no nodes (there were a lot of these)
      if len(nodes) >= 1:
        # Put in list and dictionary
        name_to_elements[name.lower()].append({"nodes": nodes, "element": element})

  # Choose most common capitalization of name
  name_choice = {}
  for name_group in name_groups.keys():
    names = name_groups[name_group]

    name_counts = {name: names.count(name) for name in set(names)}

    name_choice[name_group] = max(name_counts, key=name_counts.get)

  for name_group in name_groups.keys():
    name_to_elements[name_choice[name_group]] = name_to_elements.pop(name_group)

  return name_to_elements

# Find distance between two nodes
def point_distance(node_ref_list, node1, node2):
  # Get coordinates based on node reference
  p1 = (node_ref_list[node1]['lat'], node_ref_list[node1]['lon'])
  p2 = (node_ref_list[node2]['lat'], node_ref_list[node2]['lon'])

  return geodesic(p1, p2).meters

# Combines list of ways with the same name into a single way, in the proper order
def combine_ways(ways, tree):
  root = tree.getroot()

  # Dictionary to map nodes to their coordinates
  all_nodes = {}
  for node in root.findall('node'):
    all_nodes[node.attrib['id']] = {'lat': float(node.attrib['lat']), 'lon': float(node.attrib['lon'])}

  combined_ways = {}

  # For each group of ways (with the same name)
  for name, way_list in ways.items():
    # Get the first way from the list
    first = way_list.pop(0)
    # Get the list of its nodes
    combined = first["nodes"]

    # Until there are no more remaining ways
    while way_list:
      # Determines ending points of the trail
      trail_start = combined[0]
      trail_end = combined[-1]

      # Sets initial values for tracking connecting way
      best_match = None
      best_position = None
      best_direction = None
      min_distance = float('inf')

      # For each (remaining) way
      for i, segment in enumerate(way_list):
        # Get its nodes and ending points
        segment_nodes = segment["nodes"]
        segment_start = segment_nodes[0]
        segment_end = segment_nodes[-1]

        # Possible ways to connect to existing trail
        options = [
            (point_distance(all_nodes, trail_end, segment_start), i, 'end', 'forward'), # Comparing end of existing trail to new start (keep nodes in same order and then append)
            (point_distance(all_nodes, trail_end, segment_end), i, 'end', 'reversed'), # Comparing end of existing trail to new end (reverse new way and then append)
            (point_distance(all_nodes, trail_start, segment_end), i, 'start', 'forward'), # Comparing start of existing trail to new end (append existing to new)
            (point_distance(all_nodes, trail_start, segment_start), i, 'start', 'reversed') # Comparing start of existing trail to new start (reverse new way and append existing to it)
        ]

        # For each option, determine if it's the minimum distance seen thus far; update values if so
        for dist, idx, position, direction in options:
          if dist < min_distance:
            min_distance = dist
            best_match = idx
            best_position = position
            best_direction = direction

      # If the minimum distance is greater than 100 meters, something is probably wrong
      if min_distance > 100:
        print(f"Warning: Large distance {min_distance} detected for {name}")
        if min_distance > 1000:
          print(f"Skipping {name} due to large distance.")
          break

      # Get the node list from best match
      segment_nodes = way_list.pop(best_match)["nodes"]

      # Reverse match order
      if best_direction == 'reversed':
        segment_nodes = list(reversed(segment_nodes))

      # Append existing way to match
      if best_position == 'start':
        combined = segment_nodes[:-1] + combined
      # Append match to existing way
      else:
        combined += segment_nodes[1:]

    # Set as value for dictionary
    combined_ways[name] = combined

  return combined_ways

def get_altitude(longitude, latitude):
  try:
    url = f"https://api.open-elevation.com/api/v1/lookup?locations={latitude},{longitude}"
    response = requests.get(url)
    response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
    data = response.json()

    if data and data['results']:
      altitude = data['results'][0]['elevation']
      return altitude
    else:
      print("No altitude data found in API response.")
      return None

  except requests.exceptions.RequestException as e:
    print(f"Error during API request: {e}")
    return None
  except (KeyError, IndexError):
    print("Error: Unexpected response format from API")
    return None

# Convert existing XML data to geojson-type format
def convert_ways_to_geojson(ways, tree):
  root = tree.getroot()

  # Dictionary to map nodes to their coordinates
  nodes = {}
  for node in root.findall('node'):
    nodes[node.attrib['id']] = {'lat': float(node.attrib['lat']), 'lon': float(node.attrib['lon'])}

  # For each way
  geojson_features = []
  for name, node_refs in ways.items():
    # Generate list of coordinates
    coordinates = []
    distance = 0

    for ref in node_refs:
      if ref in nodes:
        coord = ([nodes[ref]['lon'], nodes[ref]['lat']])

        # Calculate distance between current and previous node
        if len(coordinates) > 0:
          distance += geodesic(coordinates[-1][::-1], coord[::-1]).meters

        coordinates.append(coord)
      else:
        print(f"Warning: Node with ID {ref} not found for way {name}")

    if coordinates and distance >= 1000:
      #start_alt = get_altitude(coordinates[0][0], coordinates[0][1])
      start_alt = 0
      #end_alt = get_altitude(coordinates[-1][0], coordinates[-1][1])
      end_alt = 0
      alt_diff = end_alt - start_alt

      # Append in geojson-type format
      geojson_features.append({
        "type": "Feature",
        "properties": {"name": name, "distance": distance, "alt_diff": alt_diff},
        "geometry": {
          "type": "LineString",
          "coordinates": coordinates
        }
      })

  # Sort the features by name
  geojson_features.sort(key=lambda x: x['properties']['name'])

  return geojson_features

# Put trail(s) on map
def show_trail(geojson_data, bounds, trail_name = " "):
  center = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]

  m = folium.Map(location=center, zoom_start=9)  # Initialize a map

  # For each way
  for feature in geojson_data:
    name = feature['properties']['name']
    coordinates = feature['geometry']['coordinates']

    # If input trail is " ", all trails will display. Otherwise, a string or list of string query will display those trails
    if trail_name == " " or name == trail_name or name in trail_name:
      # Add trail line to map
      folium.GeoJson(feature, style_function=lambda x: {'color': 'blue'}).add_to(m)

      start_point = coordinates[0]
      end_point = coordinates[-1]

      # Add marker at start of trail
      folium.map.Marker(
        location=[start_point[1], start_point[0]],
        popup=f"Start: {name}",
        icon=folium.Icon(color="blue", prefix='fa', icon='play') # Start icon
      ).add_to(m)

      # Add marker at end of trail
      folium.map.Marker(
        location=[end_point[1], end_point[0]],
        popup=f"End: {name}",
        icon=folium.Icon(color="red", prefix='fa', icon='stop')  # End icon
      ).add_to(m)

  # Add bounding box rectangle
  folium.Rectangle(bounds = bounds, color = 'red', fill = False).add_to(m)

  return m

# Parse data from OSM
tree = ET.parse(io.StringIO(osm_data))

raw_ways = get_ways_by_name(tree)
combined_ways = combine_ways(raw_ways, tree)
geojson_data = convert_ways_to_geojson(combined_ways, tree)

bounds = [[34.138, -118.798], [34.768, -117.318]]

all_names = [feature['properties']['name'] for feature in geojson_data]

m = show_trail(geojson_data, bounds, ["Verdugo Crest Trail"])

m

def export_geojson(geojson_features, filename="output.geojson"):
  geojson_data = {
    "type": "FeatureCollection",
    "features": geojson_features
  }

  with open(filename, "w") as f:
    json.dump(geojson_data, f, indent = 2)

export_geojson(geojson_data)


