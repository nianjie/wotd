const HTTP = require('q-io/http');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

const readFeed = {
  readFrom(feedurl) {
    // Here the parser, a dependent 3rd lib, makes use of the Node.js callback pattern,
    // where callbacks are in the form of function(err, result).
    // Wrapping as thenable so make it support promise functionality.
    return new Promise((resolve, reject) => {
    HTTP.request(feedurl)
    .then(res => res.body.read())
    .then(body => {
      parser.parseString(body, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      })
    })
    .catch(reason => reject(reason))
    });
  },
};

module.exports = readFeed;
