var Q = require('q');
var HTTP = require('q-io/http');
var APPS = require('q-io/http-apps');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();

var Firebase = require('firebase');
var fireAdmin = require('firebase-admin');

var firebaseApp = fireAdmin.initializeApp({
    databaseURL: "https://newwotd.firebaseio.com/",
    credential: fireAdmin.credential.cert(require(process.env.DEV ? './.env/serviceAccount.json' : './firebase.account'))
});
var root = firebaseApp.database().ref();

var rss_url = 'http://feeds.feedburner.com/OLD-WordOfTheDay';
var port = process.env.PORT || 0;

function app(req) {
    return APPS.ok('awesome!\n');
}

//
// schema B
// WOTD
//    |
//    |-chronological
//    |  |
//    |  |-2017
//    |  |    |
//    |  |    |-01
//    |  |    | |
//    |  |    | |-01
//    |  |    | | |-word A
//    |  |    | |
//    |  |    | |-02
//    |  |    | | |-word B
//    |  |    | |
//    |  |    | |-...
//    |  |    |   |-word C
//    |  |    |
//    |  |    |-02
//    |  |    | |
//    |  |    | |-01
//    |  |    | | |-word D
//    |  |    | |
//    |  |    | |-...
//    |  |    |    |-word E
//    |  |    |
//    |  |    |-+...
//    |  |
//    |  |-+2016
//    |  |
//    |  |-+20...
//    |
//    |-word
//       |-word A
//       |  |-definition:
//       |  |-link:
//       |  |-updated:
//       |-word B
//       |  |-definition:
//       |  |-link:
//       |  |-updated:
//       |-word ...
//          |-definition:
//          |-link:
//          |-updated:
//
// advantange/disadvantage of this structure:
// +) easy to track down words by dates
// +) give no chance to ignore word that has previously been appeared 
// -) need efforts to implement
function getrss() {
    return HTTP.request(rss_url).then(function(res) {
	return res.body.read();
    }).then(function(body){
	return Q.npost(parser, 'parseString', [body]);
    }).done(function(xmlobj) {
	// save to firebase
	// year, month and date of today
	var today = new Date();
	var year = today.getUTCFullYear(), month = today.getUTCMonth(), date = today.getUTCDate();
	var location = `${year}/${month}/${date}`;
	    xmlobj.feed.entry.forEach(function(e) {
		if (isWordOfTheDay(e, today)) {
		    // save the word under chronological
		    root.child(`chronological/${location}/`).set(`${e.title[0]}`);
		    // then save other detail attributes under word
		    root.child(`word/${e.title[0]}`).once('value')
			.then(function(snap) {
			    if (!snap.exists()) {
				var detail = {
				    updated : e.updated[0],
				    link : e['feedburner:origLink'][0],
				    definition: getDef(e.summary[0]['_'])
				};
				snap.ref.set(detail);
			    }
			});
		}
	    });
    });
}

function isWordOfTheDay(e, today) {
    var updatedday = new Date(e.updated[0]);
    return updatedday.getUTCFullYear() == today.getUTCFullYear() &&
	updatedday.getUTCMonth() == today.getUTCMonth() &&
	updatedday.getUTCDate() == today.getUTCDate();
}
function getDef(summary) {
    var index = 0;
    if (summary && (index = summary.indexOf('<img src=')) > 0) {
	return summary.substring(0, index);
    }
    return summary;
}

/**
 * Fetch word of the day based on the strcture of Schema B.
 */
function wotd(req) {
    var today = new Date();
    var year = today.getUTCFullYear(), month = today.getUTCMonth(), date = today.getUTCDate();
    var location = `${year}/${month}/${date}`;
    return root.child(`chronological/${location}`).once('value').then(function(latestsnap) {
	return latestsnap.val();
    }).then(function(latest) {
	if (!latest) {
	    throw new Error('Couldn\'t get value saved under latest.');
	}
	return root.child('word').child(latest).once('value').then(function(wordsnap) {
	    return wordsnap.val();
	});
    }).then(function(word){
	return APPS.json(word);
    });

}
// By applying combination of Chain and Branch together, it's nicely easy to build a lightweight API that can be deployed or attached to any path route.
// The following code snippet constructs an API that has a following structure:
// WOTD API
//        |_/.
//        |__/all
//        |__/chronological
//        |__/alphabetical
//        |__/count
var wotdAPI = APPS.Chain()
    .use(APPS.Cap, APPS.Branch({
	'all': wotd_all,
	'chronological': wotd_chronological,
	'alphabetical': wotd_alphabetical,
	'count': wotd_count
    }))
    .end(wotd)
;

function wotd_all() {
    return APPS.ok('all is awesome.');
}

function wotd_chronological() {
    return APPS.ok('chronological list will be the result.');
}

function wotd_alphabetical() {
    return APPS.ok('alphabetical list will be the result.');
}

function wotd_count() {
    return APPS.ok('number of count of words will be the result.');
}

app = APPS.Chain()
    .use(APPS.Log)
    .use(function(next) {
	return APPS.Branch({
	    'wotd' : wotdAPI
	}, next);
    })
    .end(APPS.notFound)
;

var server = HTTP.Server(app);

server.listen(port).then(function(server) {
    console.log(`Application is listening on port:${server.address().port}.`);
    getrss();
}).catch(function(reason) {
    // all un-caught error should come here
    console.log(`error[system] : ${reason}`);
});
