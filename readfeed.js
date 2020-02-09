const HTTP = require('q-io/http');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

const readFeed = {
  readFrom(feedurl) {
    return HTTP.request(feedurl)
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
      }));
  },
};

module.exports = readFeed;
