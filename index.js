const async = require('async');
const request = require('request');
const _ = require('lodash');

class SonOfABatch {

  constructor(opts) {
    this.opts = opts || {};

    // if the middleware is passed an explict host and port to default to, set it up.
    this.defaultServiceUrl = this.opts.serviceUrl;
    if (!this.defaultServiceUrl) {
      this.defaultServiceUrl = `${this.opts.protocol || 'http'}://127.0.0.1`;
      if (this.opts.port) {
        this.defaultServiceUrl += `:${this.opts.port}`;
      }
    }

    if (!this.opts.formatter) {
      this.opts.formatter = this.defaultFormatter;
    }

    _.bindAll(this, 'call');
  }

  call(req, res) {
    if (process.env.DEBUG) {
      console.log('sonofabatch: req.headers received');
      console.log(JSON.stringify(req.headers, null, '\t'));
    }
    const execution = req.body.execution || 'parallel';
    const requests = req.body.requests;
    // the serviceUrl can be passed at the top-level of the request and apply to all calls.
    const globalServiceUrl = req.body.serviceUrl;

    async.map(requests,
      (r, mapCb) => {
        const serviceUrl = r.serviceUrl
          ? r.serviceUrl
          : globalServiceUrl || this.defaultServiceUrl;

        let headers = r.headers;
        if (this.opts.mergeHeaders) {
          const headersToMerge = this.opts.mergeHeaders.split(',');
          headers = Object.assign({}, _.pick(req.headers, headersToMerge), r.headers);
        }

        const opts = {
          url: `${serviceUrl}${r.path}`,
          method: r.method,
          headers: headers,
          json: true,
          gzip: this.isGzip(headers)
        };

        if (r.query) {
          opts.qs = r.query;
        }
        if (r.body) {
          opts.body = r.body;
        }

        if (process.env.DEBUG) {
          console.log('sonofabatch: request options being passed');
          console.log(JSON.stringify(opts, null, '\t'));
        }

        const composedCb = (callback) => {
          request(opts, (err, response, body) => {
            callback(err, this.opts.formatter(err, response, body));
          });
        };

        mapCb(null, composedCb);
      },
      (err, calls) => {
        if (err) return res.sendStatus(500);

        async[execution](calls, (err, results) => {
          if (err) return res.sendStatus(500);

          res.send(results);
        })
      });
  }

  isGzip(headers) {
    if (!headers) return false;

    let acceptEncoding = headers['accept-encoding'];
    if (!acceptEncoding) { acceptEncoding = headers['Accept-Encoding']; }
    if (!acceptEncoding) { return false; }

    return acceptEncoding.includes('gzip');
  }

  defaultFormatter(err, response, body) {
    return body;
  }

}

module.exports = SonOfABatch;