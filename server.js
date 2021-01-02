const HTTP = require('q-io/http');
const APPS = require('q-io/http-apps');
const fireAdmin = require('firebase-admin');
const feedReader = require('./readfeed');
const { Dictionary, Word } = require('./lib/index');

const firebaseConfig = require(process.env.DEV ? './.env/serviceAccount.json' : './firebase.account'); // eslint-disable-line 
const firebaseApp = fireAdmin.initializeApp({
  databaseURL: firebaseConfig.databaseURL,
  credential: fireAdmin.credential.cert(firebaseConfig),
});

const root = firebaseApp.database().ref();
const oxfordDictionary = new Dictionary(root);

async function readFeedFrom(feedurl) {
  try {
    const xmlobj = await feedReader.readFrom(feedurl);
    const today = new Date();
    xmlobj.feed.entry.forEach((e) => {
      // save to the dictionary if word of the today
      const word = Word.isWordOfTheDay(e, today);
      if (word) {
        oxfordDictionary.createWordOfTheDay(word);
      }
    });
  } catch (reason) {
    console.log(`Reading rss feed faild. Because ${reason}`);
  }
}

/**
 * Fetch word of the day.
 * if no specific date is given, defual to today.
 */
async function wordOfTheDay(today = new Date()) {
  const word = await oxfordDictionary.getWordOfTheDay(today);
  return APPS.json(word);
}

// complete date specified by URI if incompleted with default value,
// then return it as a Date object.
// dateURI always starts with '/'.
function normaliseDate(dateURI) {
  let segs = dateURI.split('/');
  console.log(`segs with value ${segs}`);
  switch (segs.length) {
    case 2:
      segs = [...segs, '1', '1']; // complete both of month and date
      break;
    case 3:
      segs = [...segs, '1']; // complete date
      break;
    default:
      break;
  }
  segs[2] = (parseInt(segs[2], 10) - 1) % 12; // month value is between 0 and 11.
  segs[3] = parseInt(segs[3], 10) % 31; // date value is an integer between 1 and 31.
  [, ...segs] = segs; // reduce the segs[0]( equal '').
  return new Date(...segs);
}

function wotdChronological(req) {
  const today = normaliseDate(req.pathInfo);
  return wordOfTheDay(today);
}

async function wotdAlphabetical(req) {
  let words = req.pathInfo.split('/');
  words = words.filter((w) => w.length > 0);
  console.log(`requested words ${words}`);
  const all = words.map((w) => oxfordDictionary.getWord(w));
  const definitions = await Promise.all(all);
  return APPS.json(definitions);
}

// Response to ROOT/all
function wotdAllBranch() {
  return APPS.ok('all is awesome.');
}

// Response to ROOT/chronological
// If no further path or ending with /,
// APPS.ok is invoked to show usage tips;
// otherwise the rest is processed like below:
// if it starts with today/(including end up with today),
// then wotd is invoked,
// otherwise wotdChronological.
const chronologicalBranch = APPS.Chain()
  .use(APPS.Cap, APPS.Branch({
    today: () => wordOfTheDay(),
  }, wotdChronological))
  .end(() => APPS.ok('specify the date in URL.'));

// Response to ROOT/alphabetical
const alphabeticalBranch = APPS.Chain()
  .use(APPS.Cap, wotdAlphabetical)
  .end(() => APPS.ok('specify the words(separating with forward slashs) in URL')); // eslint-disable-line

// Response to ROOT/count
async function wotdCountBranch() {
  try {
    const num = await oxfordDictionary.getWordCount();
    return APPS.json(num);
  } catch (reason) {
    return APPS.ok(`Opps! Something is wrong : ${reason}`);
  }
}

// Response to ROOT/random
async function wotdRandomBranch() {
  try {
    const word = await oxfordDictionary.getAnyWord();
    return APPS.json(word);
  } catch (reason) {
    return APPS.ok(`Opps! Something is wrong : ${reason}`);
  }
}

// By applying combination of Chain and Branch together,
// it's nicely easy to build a lightweight API that can be deployed or attached to any path route.
// The following code snippet constructs an API that has a following structure:
// WOTD API
//        |_/.
//        |__/all
//        |__/chronological
//            |__/today
//            |__/YYYY/MM/DD
//        |__/alphabetical
//        |__/count
//        |__/random
const wotdAPI = APPS.Chain()
  .use(APPS.Cap, APPS.Branch({
    all: wotdAllBranch,
    chronological: chronologicalBranch,
    alphabetical: alphabeticalBranch,
    count: wotdCountBranch,
    random: wotdRandomBranch,
  }))
  .end(() => wordOfTheDay());

const app = APPS.Chain()
  .use(APPS.Log)
  .use(APPS.Branch)
  .end({
    wotd: wotdAPI,
  });

const server = HTTP.Server(app);
const port = process.env.PORT ? process.env.PORT : (process.env.DEV ? 8080 : 0); // eslint-disable-line

server.listen(port).then((lserver) => {
  console.log(`Application is listening on port:${lserver.address().port}.`);
  // Oxford Learner's Dictionaries Feed
  const OLDFeed = 'http://feeds.feedburner.com/OLD-WordOfTheDay';
  readFeedFrom(OLDFeed);
}).catch((reason) => {
  // all un-caught error should come here
  console.log(`error[system] : ${reason}`);
});
