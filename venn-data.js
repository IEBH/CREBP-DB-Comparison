var _ = require('lodash');
var async = require('async-chainable');
var colors = require('colors');
var csv2array = require('csv2array');
var fs = require('fs');
var util = require('util');

async()
	.set('input', 'data/database-analysis.csv')
	.set('output', 'results/index.html')
	.set('lines', [])
	.set('dbs', [
		{id: 'cochrane', title: 'Cochrane', file: 'data/Cochrane Library CDSR HTA DARE.xml'},
		{id: 'dare', title: 'DARE', file: 'data/DARE.xml'},
		{id: 'embase', title: 'Embase', file: 'data/Embase.xml'},
		{id: 'epistemonikos', title: 'Epistemonikos', file: 'data/Epistemonikos.xml'},
		{id: 'medline', title: 'Medline Ovid', file: 'data/Medline Ovid.xml'},
		{id: 'pubmed-health', title: 'PubMed Health', file: 'data/PubMed Health.xml'},
		{id: 'trip', title: 'TRIP', file: 'data/TRIP.xml'},
	])
	.parallel({
		sets: function(next) { // Calculate intial combinatory sets
			var sets = [];
			for (var val = 1; val < Math.pow(2, this.dbs.length); val++) {
				var set = [];
				this.dbs.forEach(function(db, index) {
					if (val & Math.pow(2, index)) set.push(db.id);
				});
				sets.push({sets: set, size: 0});
			}
			return next(null, sets);
		},
		lines: function(next) { // Read file into CSV lines
			fs.readFile(this.input, function(err, data) {
				if (err) return next(err);
				next(null, data.toString().split("\n").map(function(line) { return csv2array(line, {delimiter: ','})[0] }));
			});
		},
		html: function(next) { // Read HTML file
			fs.readFile(this.output, next);
		},
	})
	.then(function(next) {
		console.log('Processing', colors.cyan(this.lines.length), 'CSV lines');
		next();
	})
	.limit(10)
	.then('lines', function(next, line) {
		var self = this;

		self.lines.forEach(function(line) {
			if (!line) return;
			line.shift(); // Trim front (title) 
			line.pop(); // and end(conflict)

			self.dbs.forEach(function(db, index) {
				if (line[index] == 'Include') {
					// Increase size of initial DB set
					var initialDB = _.find(self.sets, function(i) {
						return i.sets.length == 1 && i.sets[0] == db.id;
					});
					if (!initialDB) {
						console.log(colors.red('Cannot find database size for ' + db.id));
						return;
					}
					initialDB.size++;
				}
			});
		});
		next();
	})
	.then(function(next) {
		var newHTML = this.html.toString().replace(/\/\/ Result data {{{[\s\S]+?}}}/, '// Result data {{{\n' + util.inspect(this.sets) + ';\n// }}}');
		fs.writeFile(this.output, newHTML, next);
	})
	.end(function(err) {
		if (err) {
			console.log(colors.red('ERROR'), err);
			process.exit(1);
		}
		process.exit(0);
	});
