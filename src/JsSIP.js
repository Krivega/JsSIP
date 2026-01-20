const pkg = require('../package.json');
const C = require('./Constants');
const Exceptions = require('./Exceptions');
const Utils = require('./Utils');
const UA = require('./UA');
const URI = require('./URI');
const NameAddrHeader = require('./NameAddrHeader');
const Grammar = require('./Grammar');
const WebSocketInterface = require('./WebSocketInterface');
const debug = require('debug')('JsSIP');
const RTCSession = require('./RTCSession');
const IncomingRequest = require('./SIPMessage').IncomingRequest;
const IncomingResponse = require('./SIPMessage').IncomingResponse;
const OutgoingRequest = require('./SIPMessage').OutgoingRequest;

debug('version %s', pkg.version);

/**
 * Expose the JsSIP module.
 */
module.exports = {
  C,
  Exceptions,
  Utils,
  UA,
  URI,
  NameAddrHeader,
  WebSocketInterface,
  Grammar,
  RTCSession,
  IncomingRequest,
  IncomingResponse,
  OutgoingRequest,
  // Expose the debug module.
  debug : require('debug'),
  get name() { return pkg.title; },
  get version() { return pkg.version; }
};
