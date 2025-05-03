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

## Displaying User Searched Trail

**Process:**  
When a user submits a search query we first find the best matching trail name (picking the first trail that matches the query). Once a trail is found, we retrieve its coordinates from the GEOJSON and add a new line layer to Mapbox connecting these coordinates. We then generate a Google search link based on the trail name and place a textbox pop at the middle point of the trail, containing the distance and link to Google.

**Challenges:**  
We first attempted to take a single trail XML file that was stored in the repository and fetch that trail file using its file path. This approach had the same process of converting the XML file to a GeoJSON and displaying that on the map as a line.

## Hosting

**Process:**  
We established a secure SSH connection to Professor Cianci’s remote host, cloned our GitHub repository, and ran the project from there. This allowed us to enable dynamic features that were not supported on GitHub pages. Most importantly, we needed to schedule backend processes (specifically ‘trail_scrape.py’) to be run on a timer. This allowed us to ensure that every day the trail data was retrieved from OpenStreetMaps. We used a cron job to execute this script daily.

**Re-Implementation Recommendation:**  
To host a similar application, you would need a service that provides full server access, supports running Python scripts, and allows you to set up a cron job (or similar). We recommend DigitalOcean (https://www.digitalocean.com), a service we were considering using before settling on Professor Cianci’s server. Some of the requirements needed are:  
- Python 3.7+  
- Ability to install Python packages (via pip)  
- Crontab or other task scheduler  
- SSH access for secure development

**Challenges:**  
We used two different hosting setups over the course of the project: GitHub Pages and a remote server hosted by our Professor, Chris Cianci. At first, we hosted the site using GitHub Pages, which allowed us to serve the website directly from a branch of our repository. We initially went in this direction because GitHub Pages is exceedingly easy to set up and was sufficient for our original goals of displaying a static website with basic map functionality. As the project grew, we needed dynamic capabilities, specifically, the ability to automatically download trial data from the Overpass API and convert it to GeoJSON. GitHub Pages does not support backend processing or scheduled scripts, so we transitioned to using a remote server provided by Professor Cianci.

## Website Features

### Time Tracker  
The time tracker uses built-in JavaScript functions to retrieve the current system time when the website loads. This time is stored in two variables, hour and minute, which are combined into a single time input. A JavaScript slider widget is connected to these variables, allowing users to adjust the time of day. As the slider moves, event listeners update the time input, which in turn updates the shade displayed on the map in real time. 

### Date Selection  
The date selection feature operates in a similar way. When the site loads, the current date is retrieved and stored in a date variable. Users can adjust this date using a built-in calendar widget, with an input of type date. When the date is changed, an event listener updates the variable and refreshes the shade map to reflect sun position and shadow behavior for the selected date.

### Trail Search Bar  
The trail search bar provides a way to quickly locate and highlight specific trails. As the user types a query, the input is matched against the trail names in the GeoJSON data. The search algorithm picks the first trail that matches the query.

## Development Environment

We used GitHub to host the remote repository. We use GitKraken locally on our devices to visualize the tree and help connect between the remote and the local. We wrote ‘map.js’, ‘styles.css’, and ‘index.html’ in Cursor, while Python files in previous versions (before dynamic trail retrieval) were written in PyCharm. The XML scraping was done in CoLab notebooks, and the resulting Python script was written into ‘trail_scrape.py’.

## Future Work

### Improved Processing of Trails:  
There were a number of ways which we wished we could have better filtered the trails options searchable by the user. The primary issue was that trails did not have a uniform naming convention, and there were many trails with almost identical names or only differing by access points. For example, there may be a ‘Trail 1’ and ‘Trail 10’ that both autofilled or were grouped together. Additionally, some trails may have different access points that make them seem like different trails when in fact they are not, something like ‘Mountain Peak via Back Entrance’ vs ‘Mountain Peak via Front Entrance’ would be treated differently when a user may wish to see both simultaneously to get a full picture of the trail. Handling naming conventions and exploring the full extent of the data we can extract from OpenStreetMap was outside of the scope of the project, but has many promising applications for future work.

### Additional Features:  
- Estimating time it would take to walk the hike, then dynamically displaying how the shade conditions change over the course of the hike, representing the hiker as a dot moving along the trail with changing shade conditions  
- Calculation for how much of the duration of a hike would be spent in the shade based on the start time of the hike, expected speed of the hiker, and change in sun position over time  
- Filter hikes based on how much shade coverage they will have  
- A recommendation based on a percent shaded (e.g. they say they want 50%)  
- Integrating more with AllTrails to get more of their information