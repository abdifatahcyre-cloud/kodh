"""Inline Leaflet and the geometry module into one self-contained index.html."""
import pathlib
here = pathlib.Path(__file__).parent
vendor = here / 'vendor'
src = (here / 'index.src.html').read_text()
css = (vendor / 'leaflet.css').read_text()
js = (vendor / 'leaflet.js').read_text()
geo = (here / 'geo.js').read_text()
out = src.replace('/*LEAFLET_CSS*/', css).replace('/*LEAFLET_JS*/', js).replace('/*GEO_JS*/', geo)
(here.parent / 'index.html').write_text(out)
print('built', len(out), 'bytes')
