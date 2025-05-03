# Engineering Documentation

## Mapbox API  
**Source:** https://docs.mapbox.com/mapbox-gl-js/api/

**Function:**  
The MapBox API was selected because it provides a number of base features for the map interface, including terrain visualization and interactivity (zooming, panning, adding overlays like trail routes and shade layers). It also has extensive and clear documentation available for free online: https://docs.mapbox.com/mapbox-gl-js/api/

**Our Implementation:**  
We created a free Mapbox account giving access to 50,000 API calls per month. We then generated a public access API key, and initialized the map in our website using the Mapbox GL JS library (see lines 9-18 of ‘map.js’ file). From the documentation they state that their API keys are not meant to be kept hidden since they can be freely obtained and used.

**Implementation Decisions:**  
- **Map Style:** We chose a natural, terrain-focused style to highlight elevation and land cover that contrasted well with the shade overlay and our trail display.  
- **Map Bounds:** Initially, we set the bounds to cover the main area of the forest where most trails were located. After visualizing trail data, we noticed some trails extending farther northwest, so we expanded the bounds. We further adjusted the view after spotting a few more trails outside the initial area to ensure complete coverage. We ultimately used two separate bounding boxes: one for the OpenStreetMap Overpass API query, which determines the extent of trails retrieved (with latitude between 34.138 and 34.768 and longitude between -118.798 and -117.318), and a slightly larger one for the map view itself (). This second bounding box defines the maximum area users can pan and zoom within the map interface. We chose to limit zooming and panning beyond this region for aesthetic reasons and to keep the user focused on the relevant trail network.

**What more you could do with it:**  
Mapbox allows full customization of the map's visual style. You could design your own style to better match your application's theme or highlight specific terrain features. We recommend going through the documentation to see what options are available

## ShadeMap API  
**Source:** https://shademap.app/about/

**Function:**  
Calculates and displays real-time or date-specific shade coverage over the map. It acts as an extension to Mapbox by layering shade predictions based on the sun’s position and topological features of the terrain.

**Our Implementation:**  
We created a ShadeMap object tied to the Mapbox map and updated the shade layer based on the user's selected date and time inputs (see lines 169-196 of ‘map.js’ file)

**Implementation Decisions:**  
- **Library choice:** We chose to integrate the ShadeMap API with Mapbox rather than using an alternative like Leaflet.js because it was smoother, worked faster, and had better documentation.  
- **Working with obfuscated code:** The ShadeMap’s code was heavily obfuscated with variable names as single letters. Because of its large size, instead of attempting to de-obfuscate and modify it, we decided to treat the ShadeMap API as a black box.

## Trails

### Data Sourcing  
**Process:**  
We wrote a Jupyter notebook (see section IIIB. for more) that uses the Overpass API from OpenStreetMap https://wiki.openstreetmap.org/wiki/Overpass_API to download the track and path highways within a bounding box corresponding to the Angeles National Forest area (latitude: 34.138 to 34.768 and longitude: -118.798 to -117.318) as an XML file. After developing the file in a Jupyter notebook, the resulting file is stored in the repository as ‘trail_scrape.py’. This file both retrieves and processes this XML file into a GeoJSON that contains data mapping all trail names to their trail information.

The resulting XML file contains:  
- A list of nodes with a unique ID, longitude, and latitude.  
- A list of ways, each with a list of nodes that it references by their ID.  
- Ways have key/value pairs metadata. The key value “way” has a value of either “track" or “path”, and the key “name” has the trail’s name as its value. All other key/value pairs were ignored.

The process we followed was guided by AllTrails website, as they detail where they fetch their trail data from: https://support.alltrails.com/hc/en-us/articles/360019246411-OSM-derivative-database-derivation-methodology

### Automatic Data Retrieval  
To keep our trial data up to date after we are done with the project, we set up a cron job on our remote server to automatically run ‘trail_scrape.py’ at 2:00AM every day. This retrieves and processes the newest version of the XML file every day.

To emulate this process:  
- Find out which version of python the remote server is running  
- Install any dependencies the python file uses  
- Run `crontab -e` to edit existing or create a new crontab  
- Our crontab uses `/bin/nano`  
- Write and save your cron process to a new crontab and save  
- Recommended to write cron output to log so that you can check if your cron is running correctly  
- Message `crontab: installing new crontab` confirms that your cron has been set up

**Challenges:**  
We initially manually downloaded trails from AllTrails, and stored them locally in a folder. This ended up being unsustainable, as it relied on an administrator to personally retrieve and verify hundreds of trails. This process could not be automated from AllTrails directly due to their firewalls forcing users to have an account and limiting trails downloadable per day. We learned from AllTrails' explanation of their database derivation that OpenStreetMap was a better foundational source that could be accessed using Overpass API.

### Processing  
**Process:**  
We wrote a Jupyter notebook to process the raw Overpass XML download into a usable trail dataset.

**Steps:**  
- **Parsing the XML:**  
  We used an XML parser to create an element tree. The first level contains node and way elements. Each node has a longitude and latitude coordinate and each way lists its node references and metadata (like name and type).  
- **Building a Dictionary:**  
  We converted this tree into a dictionary with trail names as keys and a list of way subtrees that share the name as the values. Each of these way subtress represent a segment of the trail. To make the dictionary case-insensitive, we grouped names by their lowercase form and renamed them according to the most popular capitalization.  
- **Combining Trail Segments:**  
  Trails often consist of multiple ways that need to be merged. Each segment would be compared to all others in a trail to find the pair with the closest endpoints. Once the match with the shortest distance was found, we would adjust the direction of the second trail (if necessary) to match the main trail and concatenate it. We repeated this process until either all of the segments were combined or all remaining segments were too far apart (>100 meters) to reasonably connect.  
- **Converting to GeoJSON:**  
  For each trail we extracted each of its nodes’ longitude and latitude value and added them in pairs to a list called coordinates. We calculated the distance of each of the trails using this list. Trails shorter than 1 kilometer were excluded to remove irrelevant minor roads. We then created and outputted a GeoJSON with each of the trails as a feature.

**Challenges:**  
We attempted spelling corrections but abandoned it because minor number differences (like "Trail 1" vs "Trail 10") caused incorrect merging. We also tried fetching elevation data, but the API calls were too slow. Our goal with this approach was to fetch trail information from a source that didn’t rely on repetitive work and manual verification by system administrators. Fully exploring the functionality and processing opportunities from this approach aside from our basic needs was outside of the scope of our project, yet is an avenue for future exploration.
