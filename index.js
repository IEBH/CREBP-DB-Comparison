var _ = require('lodash');
var async = require('async-chainable');
var colors = require('colors');
var fs = require('fs');
var reflib = require('reflib');

console.log('Beginning analysis');

async()
	.set('output', 'data/database-analysis.csv')
	.set('refs', [])
	.set('dbs', [
		{id: 'db-a', title: 'DB-A', file: 'data/db-a.xml'},
		/*{id: 'db-b', title: 'DB-B', file: 'data/db-b.xml'},
		{id: 'db-c', title: 'DB-C', file: 'data/db-c.xml'},
		{id: 'db-d', title: 'DB-D', file: 'data/db-d.xml'},
		{id: 'db-e', title: 'DB-E', file: 'data/db-e.xml'},
		{id: 'db-f', title: 'DB-F', file: 'data/db-f.xml'},
		{id: 'db-g', title: 'DB-G', file: 'data/db-g.xml'},*/
	])
	.forEach('dbs', function(next, db) {
		console.log(colors.grey('Processing database file'), colors.grey(db.file));
		var self = this;
		var refCount = 0;
		reflib.parseFile(db.file)
			.on('error', function(err) {
				next(err);
			})
			.on('ref', function(newRef) {
				refCount++;
				// Try to find an existing similar ref {{{
				if (!newRef.title) {
					console.log('SKIP', newRef);
					return;
				}
				var queryTitle = newRef.title.replace(/[^A-Z0-9]+/i, ' ');
				var found = _.find(self.refs.find, function(existingRef) {
					return existingRef.titleQuery == queryTitle;
				});
				// }}}

				if (found) { // Found existing - merge
					found.sources[db.id] = newRef.notes;
				} else { // No existing one located - create new
					newRef.sources = {};
					newRef.sources[db.id] = newRef.notes;
					newRef.titleQuery = queryTitle;
					self.refs.push(newRef);
				}
			})
			.on('end', function() {
				console.log('Extracted', colors.cyan(refCount), 'from', colors.cyan(db.file));
				next();
			});
	})
	.then(function(next) {
		var self = this;
		var csv = fs.createWriteStream(self.output);
		// Write header {{{
		csv.write(['Paper Title'].concat(self.dbs.map(function(db) {
			return db.title;
		})).join(',') + "\n");
		// }}}
		self.refs.forEach(function(ref) {
			csv.write(['\"' + ref.title + '\"'].concat(self.dbs.map(function(db) {
				return ref.sources[db.id] || 'Missing';
			})).join(',') + "\n");
		});
		csv.end();

		console.log();
		console.log(colors.green('Completed'));
		console.log(colors.cyan(self.refs.length), 'references processed from', colors.cyan(self.dbs.length), 'databases');
		console.log('Analysis file saved to', colors.cyan(self.output));
	})
	.end(function(err) {
		if (err) return console.log(colors.red('ERROR'), err);
	});
