import os
import json

# Identify folder path

folder = "Trails"

trails = []

#iterate through filenames in trails folder
for filename in os.listdir(folder):
    if filename.lower().endswith(".gpx"):
        name = os.path.splitext(filename)[0]
        
        # Remove [CLOSED] from name if present
        if "[CLOSED]" in name:
            name = name.replace("[CLOSED]", "").strip()

        # Replace Mt. or Mt with Mount and Rd with Road
        if "Mt. " in name or " Mt." in name:
            name = name.replace("Mt. ", "Mount ").strip()
            name = name.replace(" Mt.", " Mount").strip()
        if "Mt " in name or " Mt" in name:
            name = name.replace("Mt ", "Mount ").strip()
            name = name.replace(" Mt", " Mount").strip()
        if "Rd " in name or " Rd" in name:
            name = name.replace("Rd ", "Road ").strip()
            name = name.replace(" Rd", " Road").strip()

        # Create dictionary to be turned into json
        trail_entry = {
            "name": name,
            "file": os.path.join(folder, filename)
        }
        trails.append(trail_entry)

# Sort trails alphabetically by name
trails.sort(key=lambda x: x["name"].lower())

# Write trails list to JSON
output_file = "trails.json"
absolute_output_path = os.path.abspath(output_file)
print("Output file saved at:", absolute_output_path)

with open(output_file, "w") as f:
    json.dump(trails, f, indent=2)

