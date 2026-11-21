# KODH Real Estate · Jijiga

Prototype of a land-listing system for Jijiga, Ethiopia.

- **Find land:** satellite map with every plot drawn at its true size. Filter by area, budget and size. Tap a plot to see price, measurements, the side facing the road, corner-brick photos and directions.
- **Add plot:** an agent stands on each of the 4 corner bricks. The phone averages GPS readings for each brick, a photo of the brick is taken, and the tape sizes (4 sides + diagonal A–C) are entered. The app reshapes the outline to the exact tape sizes and places it on the bricks' GPS positions.
- **Manage:** mark plots for sale, reserved or sold; edit prices.

`index.html` is the whole app in one file. To change it, edit `src/index.src.html` or `src/geo.js`, then run `python3 src/build.py`.
Geometry tests: `node src/geo.test.js`.

Data is currently stored in each browser only. Next step: a shared online database.
Map: Leaflet, with Esri World Imagery and OpenStreetMap.
