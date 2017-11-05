var fs = require('fs');
var async = require('async');
var icosphere = require('./icosphere.js');

config = JSON.parse(fs.readFileSync("config.json", "utf8"));

var googleMapsClient = require('@google/maps').createClient({
	key: config.google_api_key
});

function aboutEqual(a, b, error) {
	return a > (b - error) && a < (b + error);
}


function xyzTolatlong(x, y, z) {
	var longitude = -(Math.atan2( -z, -x )) - Math.PI / 2;
	if(longitude < - Math.PI) {
		longitude += Math.PI * 2;
	}
	return {
		latitude: Math.asin(y) * (180 / Math.PI),
		longitude: longitude * (180 / Math.PI)
	};
}


function toFileString(globe) {
	var locations_text = globe.locations.map(loc => {
		return `{ ${loc.latitude}, ${loc.longitude}, ${loc.elevation} }`
	}).join(",\n\t"); 

	var triangles_text = globe.triangles.map(tri => {
		return `{ ${tri.p1}, ${tri.p2}, ${tri.p3} }`
	}).join(",\n\t"); 

	var points_text = globe.points.map(loc => {
		return `{ ${loc.x}, ${loc.y}, ${loc.z} }`
	}).join(",\n\t"); 

	return `#include "structs.hpp"

int globe_locations_count = ${globe.locations.length};
int globe_triangles_count = ${globe.triangles.length};

struct location globe_locations[] = {
	${locations_text}
};

struct triangle globe_triangles[] = {
	${triangles_text}
};

struct point globe_points[] = {
	${points_text}
};`
}

function dumpToFile(globe) {
	var file_string = toFileString(globe);
	console.log(file_string);
	fs.writeFile("cpp_opengl_renderer/globe.hpp", file_string, function(err) {
		if(err) {
			console.log(`File Writing Error: \n${err}`);
		}
	});
}


var globe = icosphere.create(5);

globe.locations = globe.points.map(p => xyzTolatlong(p.x, p.y, p.z));

var groups_size = 100;
var location_groups = []

for (var i = 0; i < globe.locations.length; i += groups_size) {
	location_groups.push(globe.locations.slice(i, i + groups_size));
}

async.mapSeries(location_groups, function(locations, callback) {
	googleMapsClient.elevation({
		locations: locations.map(loc => `${loc.latitude}, ${loc.longitude}`).join("|")
	}, function(err, response) {
		if (err) return callback(err);
		response.json.results.forEach(loc => {
			globe.locations.find(l => {
				return aboutEqual(l.latitude, loc.location.lat, 0.001) && aboutEqual(l.longitude, loc.location.lng, 0.0001);
			}).elevation = loc.elevation
		});
		callback(null, response.json);
	});
}, function(err, results) {
	if (err) {
		console.log(`Google Maps API Error: \n${err}`);
	}
	else {
		dumpToFile(globe);
	}
});