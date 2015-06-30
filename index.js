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
		{id: 'cochrane', title: 'Cochrane', file: 'data/Cochrane Library CDSR HTA DARE.xml'},
		{id: 'dare', title: 'DARE', file: 'data/DARE.xml'},
		{id: 'embase', title: 'Embase', file: 'data/Embase.xml'},
		{id: 'epistemonikos', title: 'Epistemonikos', file: 'data/Epistemonikos.xml'},
		{id: 'medline', title: 'Medline Ovid', file: 'data/Medline Ovid.xml'},
		{id: 'pubmed-health', title: 'PubMed Health', file: 'data/PubMed Health.xml'},
		{id: 'trip', title: 'TRIP', file: 'data/TRIP.xml'},
	])
	.forEach('dbs', function(next, db) {
		console.log(colors.grey('Processing database file'), colors.grey(db.file));
		var self = this;
		var refCount = 0;
		var conflictCount = 0;
		reflib.parseFile(db.file)
			.on('error', function(err) {
				next(err);
			})
			.on('ref', function(newRef) {
				refCount++;
				// Try to find an existing similar ref {{{
				if (!newRef.title) {
					console.log('Skipping blank title');
					return;
				}
				// Generate a searchable title to match by {{{
				var queryTitle = newRef.title
					.replace(/[^A-Z0-9]+/i, ' ');
				// }}}
				var found = _.find(self.refs, function(existingRef) {
					return existingRef.titleQuery == queryTitle;
				});
				// }}}

				if (found) { // Found existing - merge
					if (found.sources[db.id] && found.sources[db.id] != newRef.notes) { // Overwriting existing ref
						found.sources[db.id] = 'CONFLICT';
						conflictCount++;
					} else {
						found.sources[db.id] = newRef.notes;
					}
				} else { // No existing one located - create new
					newRef.sources = {};
					newRef.sources[db.id] = newRef.notes;
					newRef.titleQuery = queryTitle;
					self.refs.push(newRef);
				}
			})
			.on('end', function() {
				console.log('Extracted', colors.cyan(refCount), 'from', colors.cyan(db.file));
				if (conflictCount > 0) console.log('Conflicts:', colors.cyan(conflictCount), 'in', colors.cyan(db.file));
				next();
			});
	})
	.then(function(next) {
		var self = this;
		var csv = fs.openSync(self.output, 'w');
		console.log(colors.grey('Writing CSV file'));

		// Write header {{{
		fs.writeSync(csv, ['Paper Title'].concat(self.dbs.map(function(db) {
			return db.title;
		})).join(',') + "\n");
		// }}}
		self.refs.forEach(function(ref, index) {
			fs.writeSync(csv, ['\"' + ref.title + '\"'].concat(self.dbs.map(function(db) {
				return ref.sources[db.id] || 'Missing';
			})).join(',') + "\n");
		});

		fs.closeSync(csv);
		next();
	})
	.end(function(err) {
		if (err) {
			console.log(colors.red('ERROR'), err);
			process.exit(1);
		}

		console.log();
		console.log(colors.green('Completed'));
		console.log(colors.cyan(this.refs.length), 'unqiue references processed from', colors.cyan(this.dbs.length), 'databases');
		console.log('Analysis file saved to', colors.cyan(this.output));
		process.exit(1);
	});
