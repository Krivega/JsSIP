const EventEmitter = require('events').EventEmitter;
const JsSIP_C = require('../Constants');
const Exceptions = require('../Exceptions');
const Utils = require('../Utils');

module.exports = class Info extends EventEmitter
{
  constructor(session)
  {
    super();

    this._session = session;
    this._direction = null;
    this._contentType = null;
    this._body = null;
  }

  get contentType()
  {
    return this._contentType;
  }

  get body()
  {
    return this._body;
  }

  send(contentType, body, options = {})
  {
    return new Promise((resolve, reject) =>
    {
      const rejectWithError = (error) => 
      { 
        reject(new Error(error));
      };

      this._direction = 'outgoing';

      if (contentType === undefined)
      {
        return reject(new TypeError('Not enough arguments'));
      }

      // Check RTCSession Status.
      if (this._session.status !== this._session.C.STATUS_CONFIRMED &&
        this._session.status !== this._session.C.STATUS_WAITING_FOR_ACK)
      {
        return reject(new Exceptions.InvalidStateError(this._session.status));
      }

      this._contentType = contentType;
      this._body = body;

      const extraHeaders = Utils.cloneArray(options.extraHeaders);

      extraHeaders.push(`Content-Type: ${contentType}`);

      this._session.newInfo({
        originator : 'local',
        info       : this,
        request    : this.request
      });

      this._session.sendRequest(JsSIP_C.INFO, {
        extraHeaders,
        eventHandlers : {
          onSuccessResponse : (response) =>
          {
            if (response.reason_phrase === 'OK')
            {
              resolve();
              this.emit('succeeded', {
                originator : 'remote',
                response
              });
            }
            else
            {
              rejectWithError(new Error('Not allowed'));
              this.emit('failed', {
                originator : 'remote',
                response
              });
            }
          },
          onErrorResponse : (response) =>
          {
            rejectWithError(new Error('Error response'));
            this.emit('failed', {
              originator : 'remote',
              response
            });
          },
          onTransportError : () =>
          {
            rejectWithError(new Error('Transport response'));

            if (!this.options.rejectWithoutTermination) {
              this._session.onTransportError();
            }
          },
          onRequestTimeout : () =>
          {
            rejectWithError(new Error('Request timeout'));

            if (!this.options.rejectWithoutTermination) {
              this._session.onRequestTimeout();
            }
          },
          onDialogError : () =>
          {
            rejectWithError(new Error('Dialog error'));

            if (!this.options.rejectWithoutTermination) {
              this._session.onDialogError();
            }
          }
        },
        body
      });
    });
  }

  init_incoming(request)
  {
    this._direction = 'incoming';
    this.request = request;

    request.reply(200);

    this._contentType = request.hasHeader('Content-Type') ?
      request.getHeader('Content-Type').toLowerCase() : undefined;
    this._body = request.body;

    this._session.newInfo({
      originator : 'remote',
      info       : this,
      request
    });
  }
};
