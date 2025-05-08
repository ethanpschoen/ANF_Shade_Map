# Import modules
import xml.etree.ElementTree as ET
import json
from collections import defaultdict
from geopy.distance import geodesic
import requests
import io
import time

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

# Group 'ways' by name, creating a dictionary like {name: [way1, way2, ...], ...}
def get_ways_by_name(tree):
  root = tree.getroot()

  name_to_elements = defaultdict(list)

  # Make case-insensitive, so data for ' xyz trail' and 'XYZ Trail' are grouped if otherwise the same (OSM data had these inconsistencies)
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

# Combines list of ways with the same name into a single way, in the proper order. Creates a dictionary like {name: [noderef1, noderef2, ...], ...}
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

    # Repeat until there are no more remaining ways
    while way_list:
      # Determines ending points of the trail
      trail_start = combined[0]
      trail_end = combined[-1]

      # Sets initial values for tracking potential connecting way
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
        # If the minimum distance is greater than 1 kilometer, something is definitely wrong. Stop connecting this way
        if min_distance > 1000:
          print(f"Skipping {name} due to large distance.")
          break

      # Get the node list from best match
      segment_nodes = way_list.pop(best_match)["nodes"]

      # Reverse match order if needed
      if best_direction == 'reversed':
        segment_nodes = list(reversed(segment_nodes))

      # Append existing way to match if appropriate
      if best_position == 'start':
        combined = segment_nodes[:-1] + combined
      # Append match to existing way if appropriate
      else:
        combined += segment_nodes[1:]

    # Set as value for dictionary, once all way pieces are connected
    combined_ways[name] = combined

  return combined_ways

# Convert existing XML data to geojson-type format
def convert_ways_to_geojson(ways, tree):
  root = tree.getroot()

  # Dictionary to map nodes to their coordinates
  nodes = {}
  for node in root.findall('node'):
    nodes[node.attrib['id']] = {'lat': float(node.attrib['lat']), 'lon': float(node.attrib['lon'])}

  geojson_features = []
  # For each way
  for name, node_refs in ways.items():
    # Generate list of coordinates
    coordinates = []
    distance = 0

    # For each node (reference) in the way
    for ref in node_refs:
      if ref in nodes:
        # Extract the coordinates from the referred node
        coord = ([nodes[ref]['lon'], nodes[ref]['lat']])

        # Calculate distance between current and previous node
        if len(coordinates) > 0:
          distance += geodesic(coordinates[-1][::-1], coord[::-1]).meters # Order of long, lat must be reversed for this function

        coordinates.append(coord)
      else:
        print(f"Warning: Node with ID {ref} not found for way {name}")

    if coordinates and distance >= 1000: # Ways shorter than 1 kilometer are not included in the GeoJSON
      # Append in geojson-type format
      geojson_features.append({
        "type": "Feature",
        "properties": {"name": name, "distance": distance},
        "geometry": {
          "type": "LineString",
          "coordinates": coordinates
        }
      })

  # Sort the features by name
  geojson_features.sort(key=lambda x: x['properties']['name'])

  return geojson_features

# Parse data from OSM
tree = ET.parse(io.StringIO(osm_data))

raw_ways = get_ways_by_name(tree)
combined_ways = combine_ways(raw_ways, tree)
geojson_data = convert_ways_to_geojson(combined_ways, tree)

# Export as geojson
def export_geojson(geojson_features, filename="output.geojson"):
  geojson_data = {
    "type": "FeatureCollection",
    "features": geojson_features
  }

  with open(filename, "w") as f:
    json.dump(geojson_data, f, indent = 2)

export_geojson(geojson_data)

# Get time tuple
time_tuple = time.localtime()
# Format time tuple as string
formatted_time = time.strftime("%Y-%m-%d %H:%M:%S", time_tuple)

print("Completed at:", formatted_time)