var _ = require('lodash');
var async = require('async-chainable');
var colors = require('colors');
var fs = require('fs');
var reflib = require('reflib');
var request = require('superagent');

console.log('Beginning analysis');

async()
	.set('outputCSV', 'data/database-analysis.csv')
	.set('outputJSON', 'data/database-analysis.json')
	.set('url', null) // Eventual URL when the library is loaded into the SRA
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
				if (!newRef.title) newRef.title = '';
				var queryTitle = newRef.title
					.toLowerCase()
					.replace(/[^a-z0-9]+/, ' ')
					.replace(/[^a-z0-9]+/, '')
					.replace(/\(.*?\)/, '')
					.replace(/^\s+/, '')
					.replace(/\s+$/, '');

				if (!newRef.journal) newRef.journal = '';
				var queryJournal = newRef.journal
					.toLowerCase()
					.replace(/[^a-z0-9]+/, ' ');
				// }}}
				var found = _.find(self.refs, function(existingRef) {
					return (
						existingRef.titleQuery == queryTitle
						// existingRef.journalQuery == queryJournal
					);
				});
				// }}}

				if (found) { // Found existing - merge
					if (found.sources[db.id] && found.sources[db.id] != newRef.notes) { // Overwriting existing ref
						found.sources[db.id] = 'Include'; // Always err to 'Include'
						console.log('MERGE', colors.red(newRef.title), '<=>', colors.green(found.title));
						conflictCount++;
					} else {
						found.sources[db.id] = newRef.notes;
					}
				} else { // No existing one located - create new
					newRef.sources = {};
					newRef.sources[db.id] = newRef.notes;
					newRef.titleQuery = queryTitle;
					newRef.journalQuery = queryJournal;
					self.refs.push(newRef);
				}
			})
			.on('end', function() {
				console.log('Extracted', colors.cyan(refCount), 'from', colors.cyan(db.file));
				if (conflictCount > 0) console.log('Conflicts:', colors.cyan(conflictCount), 'in', colors.cyan(db.file));
				next();
			});
	})
	.parallel([
		function(next) {
			var self = this;
			var csv = fs.openSync(self.outputCSV, 'w');
			console.log(colors.grey('Writing CSV file'));

			// Write header {{{
			fs.writeSync(csv, ['Paper Title', 'Journal'].concat(self.dbs.map(function(db) {
				return db.title;
			})).join(',') + "\n");
			// }}}
			self.refs.forEach(function(ref, index) {
				// Prepare fields {{{
				var fields = [];
				
				// Title
				fields.push('\"' + ref.title + '\"');
				fields.push('\"' + ref.journal + '\"');

				// Each DB's notes field
				self.dbs.forEach(function(db) {
					fields.push(ref.sources[db.id] || 'Missing');
				});

				// Whether all notes fields are equal
				var includes = 0, excludes = 0;
				self.dbs.forEach(function(db) {
					if (!ref.sources[db.id]) return;
					if (/^include/i.test(ref.sources[db.id])) includes++;
					if (/^exclude/i.test(ref.sources[db.id])) excludes++;
				});
				fields.push(includes > 0 && excludes > 0 ? 'CONFLICT' : '');
				// }}}
				fs.writeSync(csv, fields.join(',') + "\n");
			});

			fs.closeSync(csv);
			console.log(colors.grey('CSV file written'));
			next();
		},
		function(next) {
			var self = this;
			async()
				.then(function(next) {
					console.log(colors.grey('Writing JSON file'));
					reflib.outputFile(self.outputJSON,
						self.refs
							.filter(function(ref) {
								return (ref.sources && _(ref.sources).values().indexOf('Exclude') < 0);
							})
							.map(function(ref) {
								ref.tags = Object.keys(ref.sources).map(function(dbid) {
									return _.find(self.dbs, {id: dbid}).title;
								});
								delete ref.sources;
								delete ref.notes;
								return ref;
							})
					, next);
				})
				.then(function(next) {
					console.log(colors.grey('JSON file written'));
					next();
				})
				.end(next);
		},
	])
	.then(function(next) {
		// Upload to SRA {{{
		var self = this;
		console.log(colors.grey('Uploading library to SRA'));
		var agent = request.agent();
		async()
			.set('sraURL', 'http://localhost')
			.then(function(next) {
				console.log(colors.grey('SRA login'));
				agent.post(this.sraURL + '/api/users/login')
					.send({username: 'mc', password: 'qwaszx'})
					.end(function(err, res) {
						if (err) return next(err);
						if (res.body.error) return next(res.body.error);
						next();
					});
			})
			.then(function(next) {
				console.log(colors.grey('SRA login successful'));
				console.log(colors.grey('SRA upload'));
				agent.post(this.sraURL + '/api/libraries/import')
					.field('libraryTitle', 'CREBP-DB-Comparison')
					.field('json', 'true')
					.attach('file', self.outputJSON)
					.end(function(err, res) {
						if (err) return next(err);
						self.url = res.body.url;
						console.log(colors.grey('SRA upload successful'));
						next();
					});
			})
			.end(next);
		// }}}
	})
	.end(function(err) {
		if (err) {
			console.log(colors.red('ERROR'), err);
			process.exit(1);
		}

		console.log();
		console.log(colors.green('Completed'));
		console.log(colors.cyan(this.refs.length), 'unqiue references processed from', colors.cyan(this.dbs.length), 'databases');
		console.log('Analysis file saved to', colors.cyan(this.outputCSV));
		console.log('Library file saved to', colors.cyan(this.outputJSON));
		console.log('Library available at', colors.cyan(this.url + '/tags'));
		process.exit(0);
	});
