import os
import json

# Identify folder path

folder = "Trails"

trails = []

#iterate through filenames in trails folder
for filename in os.listdir(folder):
    if filename.lower().endswith(".gpx"):
        name = os.path.splitext(filename)[0]

        # Create dictionary to be turned into json
        trail_entry = {
            "name": name,
            "file": os.path.join(folder, filename)
        }
        trails.append(trail_entry)

# Write trails list to JSON
output_file = "trails.json"
absolute_output_path = os.path.abspath(output_file)
print("Output file saved at:", absolute_output_path)

with open(output_file, "w") as f:
    json.dump(trails, f, indent=2)

