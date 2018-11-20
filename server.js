const HTTP = require('q-io/http');
const APPS = require('q-io/http-apps');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

const fireAdmin = require('firebase-admin');

const firebaseApp = fireAdmin.initializeApp({
  databaseURL: 'https://newwotd.firebaseio.com/',
  credential: fireAdmin.credential.cert(require(process.env.DEV ? './.env/serviceAccount.json' : './firebase.account')), // eslint-disable-line
});
const root = firebaseApp.database().ref();

const rssURL = 'http://feeds.feedburner.com/OLD-WordOfTheDay';
const port = process.env.PORT || 0;

function isWordOfTheDay(e, today) {
  const updatedday = new Date(e.updated[0]);
  return updatedday.getUTCFullYear() === today.getUTCFullYear()
    && updatedday.getUTCMonth() === today.getUTCMonth()
    && updatedday.getUTCDate() === today.getUTCDate();
}

function getDef(summary) {
  let index = 0;
  if (summary && (index = summary.indexOf('<img src=')) > 0) { // eslint-disable-line
    return summary.substring(0, index);
  }
  return summary;
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
  return HTTP.request(rssURL)
    .then(res => res.body.read())
    // Here the parser, a dependent 3rd lib, makes use of the Node.js callback pattern,
    // where callbacks are in the form of function(err, result).
    // Wrapping as thenable so make it support promise.
    .then(body => Promise.resolve({
      then(onFullfill, onReject) {
        parser.parseString(body, (error, result) => {
          if (error) {
            onReject(error);
          } else {
            onFullfill(result);
          }
        });
      },
    }))
    .done((xmlobj) => {
      // save to firebase under location of ROOT/year/month/date
      const today = new Date();
      const location = `${today.getUTCFullYear()}/${today.getUTCMonth()}/${today.getUTCDate()}`; // eslint-disable-line
      xmlobj.feed.entry.forEach((e) => {
        if (isWordOfTheDay(e, today)) {
          // save the word under chronological
          root.child(`chronological/${location}/`).set(`${e.title[0]}`);
          // then save other detail attributes under word
          root.child(`word/${e.title[0]}`).once('value')
            .then((snap) => {
              if (!snap.exists()) {
                const detail = {
                  updated: e.updated[0],
                  link: e['feedburner:origLink'][0],
                  definition: getDef(e.summary[0]._),
                };
                snap.ref.set(detail);
              }
            });
        }
      });
    });
}

/**
 * Fetch word of the day based on the strcture of Schema B.
 */
function wotd() {
  const today = new Date();
  const year = today.getUTCFullYear(); const month = today.getUTCMonth(); const
    date = today.getUTCDate();
  const location = `${year}/${month}/${date}`;
  return root.child(`chronological/${location}`)
    .once('value')
    .then(latestsnap => latestsnap.val())
    .then((latest) => {
      if (!latest) {
        // deal with the case the latest word not exist yet,
        // and if so null instead of exception is returned.
        console.log(`No value saved under the latest:${location}.`);
        return null;
      }
      return root.child('word')
        .child(latest)
        .once('value')
        .then(wordsnap => wordsnap.val());
    })
    .then(word => APPS.json(word));
}

function wotdAll() {
  return APPS.ok('all is awesome.');
}

function wotdChronological() {
  return APPS.ok('chronological list will be the result.');
}

function wotdAlphabetical() {
  return APPS.ok('alphabetical list will be the result.');
}

function wotdCount() {
  return APPS.ok('number of count of words will be the result.');
}

// By applying combination of Chain and Branch together, it's nicely easy to build a lightweight API that can be deployed or attached to any path route.
// The following code snippet constructs an API that has a following structure:
// WOTD API
//        |_/.
//        |__/all
//        |__/chronological
//        |__/alphabetical
//        |__/count
const wotdAPI = APPS.Chain()
  .use(APPS.Cap, APPS.Branch({
    all: wotdAll,
    chronological: wotdChronological,
    alphabetical: wotdAlphabetical,
    count: wotdCount,
  }))
  .end(wotd);

const app = APPS.Chain()
  .use(APPS.Log)
  .use(next => APPS.Branch({
    wotd: wotdAPI,
  }, next))
  .end(APPS.notFound);

const server = HTTP.Server(app);

server.listen(port).then((lserver) => {
  console.log(`Application is listening on port:${lserver.address().port}.`);
  getrss();
}).catch((reason) => {
  // all un-caught error should come here
  console.log(`error[system] : ${reason}`);
});
