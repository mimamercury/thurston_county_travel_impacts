import * as path from 'path'
import * as turf from '@turf/helpers'
import { fetchText } from '@editorialapp/datatools/fetch'
import { slugify } from '@editorialapp/datatools/text'
import { writeJson, readJson } from '@editorialapp/datatools/json'
import * as dirname from '@editorialapp/datatools/dirname'

const data_directory = dirname.join(import.meta.url, 'data')
const source_directory = path.join(data_directory, 'source')
const processed_directory = path.join(data_directory, 'processed')
const metadata_filepath = path.join(data_directory, 'metadata.json')

const metadata = await readJson(metadata_filepath)

const url = "https://www.google.com/maps/d/u/0/viewer?mid=1at3bEzzJGuYHWaOajcSVX9fqh-w&femb=1&ll=47.8113152180292,-123.16223975754684&z=6"

let text
try {
    text = await fetchText(url)
} catch (error) {
    console.error('Error fetching travel impacts data', error)
    process.exit(1)
}

const lines = text.split('\n')

const page_data_line = lines.filter((line) => {
    return line.includes('_pageData')
})[0]

const closing_script_tag_regex = /<\/script>(.*)/

const data_string = page_data_line.replace('  var _pageData = "', '')
const matches = data_string.match(closing_script_tag_regex)
const cleaned = data_string.slice(0, matches.index).replace('";', '').replace(/\\/g, "")
const parsed = JSON.parse(cleaned)
const last_updated = parsed[0][13]
const items = parsed[1][6][0][12][0][13][0]

const features = []
for (const item of items) {
    const name = item[5][0][1][0]
    const description = item[5][1][1][0]
    let coordinates = (item[1] || item[2])[0][0]

    let feature
    if (coordinates.length === 2) {
        coordinates = coordinates.reverse()
        feature = turf.point(coordinates, { name, description }, { id: slugify(`${name}_point`)})
    } else {
        coordinates = coordinates.map((point) => {
            return point[0].reverse()
        })
        feature = turf.lineString(coordinates, { name, description }, { id: slugify(`${name}_lineString`)})
    }

    features.push(feature)
}

const data = turf.featureCollection(features)

const new_updated_time = last_updated
const previous_updated_time = metadata.last_updated

if (previous_updated_time && new_updated_time <= previous_updated_time) {
    console.error('No new data', new_updated_time, previous_updated_time)
    process.exit(0)
}

metadata.last_updated = new_updated_time

const source_filepath = path.join(source_directory, `thurston_county_travel_impacts_${slugify(new Date(new_updated_time).toISOString())}.json`)
const processed_filepath = path.join(processed_directory, `thurston_county_travel_impacts_${slugify(new Date(new_updated_time).toISOString())}.geojson`)
const latest_filepath = path.join(processed_directory, 'latest.json')

await writeJson(source_filepath, parsed)
await writeJson(processed_filepath, data)
await writeJson(metadata_filepath, metadata)

