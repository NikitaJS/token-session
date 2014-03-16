/*!
 * Connect - session
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Markus Klein
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var uid = require('uid2')
  , crc32 = require('buffer-crc32')
  , parse = require('url').parse
  , signature = require('cookie-signature')

var Session = require('./session/session')
  , MemoryStore = require('./session/memory')
  , Cookie = require('./session/cookie')
  , Store = require('./session/store')

// environment

var env = process.env.NODE_ENV;

/**
 * Expose the middleware.
 */

exports = module.exports = session;

/**
 * Expose constructors.
 */

exports.Store = Store;
exports.Cookie = Cookie;
exports.Session = Session;
exports.MemoryStore = MemoryStore;

exports.createSession = function(req){
	req.sessionToken = uid(40);
	req.session = new Session(req);
}

/**
 * Warning message for `MemoryStore` usage in production.
 */

var warning = 'Warning: connect.session() MemoryStore is not\n'
  + 'designed for a production environment, as it will leak\n'
  + 'memory, and will not scale past a single process.';

/**
 * Session:
 *
 *   Setup session store with the given `options`.
 *
 *   Session data is _not_ saved in the cookie itself, however
 *   cookies are used, so we must use the [cookieParser()](cookieParser.html)
 *   middleware _before_ `session()`.
 *
 * Examples:
 *
 *     connect()
 *       .use(connect.cookieParser())
 *       .use(connect.session({ secret: 'keyboard cat', key: 'sid', cookie: { secure: true }}))
 *
 * Options:
 *
 *   - `key` cookie name defaulting to `connect.sid`
 *   - `store` session store instance
 *   - `secret` session cookie is signed with this secret to prevent tampering
 *   - `cookie` session cookie settings, defaulting to `{ path: '/', httpOnly: true, maxAge: null }`
 *   - `proxy` trust the reverse proxy when setting secure cookies (via "x-forwarded-proto")
 *
 * Cookie option:
 *
 *  By default `cookie.maxAge` is `null`, meaning no "expires" parameter is set
 *  so the cookie becomes a browser-session cookie. When the user closes the
 *  browser the cookie (and session) will be removed.
 *
 * ## req.session
 *
 *  To store or access session data, simply use the request property `req.session`,
 *  which is (generally) serialized as JSON by the store, so nested objects
 *  are typically fine. For example below is a user-specific view counter:
 *
 *       connect()
 *         .use(connect.favicon())
 *         .use(connect.cookieParser())
 *         .use(connect.session({ secret: 'keyboard cat', cookie: { maxAge: 60000 }}))
 *         .use(function(req, res, next){
 *           var sess = req.session;
 *           if (sess.views) {
 *             res.setHeader('Content-Type', 'text/html');
 *             res.write('<p>views: ' + sess.views + '</p>');
 *             res.write('<p>expires in: ' + (sess.cookie.maxAge / 1000) + 's</p>');
 *             res.end();
 *             sess.views++;
 *           } else {
 *             sess.views = 1;
 *             res.end('welcome to the session demo. refresh!');
 *           }
 *         }
 *       )).listen(3000);
 *
 * ## Session#regenerate()
 *
 *  To regenerate the session simply invoke the method, once complete
 *  a new SID and `Session` instance will be initialized at `req.session`.
 *
 *      req.session.regenerate(function(err){
 *        // will have a new session here
 *      });
 *
 * ## Session#destroy()
 *
 *  Destroys the session, removing `req.session`, will be re-generated next request.
 *
 *      req.session.destroy(function(err){
 *        // cannot access session here
 *      });
 *
 * ## Session#reload()
 *
 *  Reloads the session data.
 *
 *      req.session.reload(function(err){
 *        // session updated
 *      });
 *
 * ## Session#save()
 *
 *  Save the session.
 *
 *      req.session.save(function(err){
 *        // session saved
 *      });
 *
 * ## Session#touch()
 *
 *   Updates the `.maxAge` property. Typically this is
 *   not necessary to call, as the session middleware does this for you.
 *
 * ## Session#cookie
 *
 *  Each session has a unique cookie object accompany it. This allows
 *  you to alter the session cookie per visitor. For example we can
 *  set `req.session.cookie.expires` to `false` to enable the cookie
 *  to remain for only the duration of the user-agent.
 *
 * ## Session#maxAge
 *
 *  Alternatively `req.session.cookie.maxAge` will return the time
 *  remaining in milliseconds, which we may also re-assign a new value
 *  to adjust the `.expires` property appropriately. The following
 *  are essentially equivalent
 *
 *     var hour = 3600000;
 *     req.session.cookie.expires = new Date(Date.now() + hour);
 *     req.session.cookie.maxAge = hour;
 *
 * For example when `maxAge` is set to `60000` (one minute), and 30 seconds
 * has elapsed it will return `30000` until the current request has completed,
 * at which time `req.session.touch()` is called to reset `req.session.maxAge`
 * to its original value.
 *
 *     req.session.cookie.maxAge;
 *     // => 30000
 *
 * Session Store Implementation:
 *
 * Every session store _must_ implement the following methods
 *
 *    - `.get(sid, callback)`
 *    - `.set(sid, session, callback)`
 *    - `.destroy(sid, callback)`
 *
 * Recommended methods include, but are not limited to:
 *
 *    - `.length(callback)`
 *    - `.clear(callback)`
 *
 * For an example implementation view the [connect-redis](http://github.com/visionmedia/connect-redis) repo.
 *
 * @param {Object} options
 * @return {Function}
 * @api public
 */

function session(options){
  var options = options || {}
    , key = options.key || 'connect.sid'
    , store = options.store || new MemoryStore
    , storeReady = true,
	, logger = option.logger;

  // notify user that this store is not
  // meant for a production environment
  if ('production' == env && store instanceof MemoryStore && logger) {
    logger.warn(warning);
  }

  store.on('disconnect', function(){ storeReady = false; });
  store.on('connect', function(){ storeReady = true; });

  return function session(req, res, next) {
    // self-awareness
    if (req.session) return next();

    // Handle connection as if there is no session if
    // the store has temporarily disconnected etc
    if (!storeReady && logger) return logger.error('store is disconnected'), next();

    // expose store
    req.sessionStore = store;

    // proxy end() to commit the session
    var end = res.end;
    res.end = function(data, encoding){
      res.end = end;
      if (!req.session) return res.end(data, encoding);
      req.session.resetMaxAge();
      req.session.save(function(err){
        if (err) console.error(err.stack);
        res.end(data, encoding);
      });
    };

    // do not load a session if no session token
    if (!req.body.token) {
      next();
      return;
    }
	

    // generate the session object
    store.get(req.body.token, function(err, sess){
      // error handling
      if (err) {
        if(logger) logger.error(err);
        if ('ENOENT' == err.code) {
          next();
        } else {
          next(err);
        }
      // no session
      } else if (!sess) {
        next();
      // populate req.session
      } else {
	    // get the session token from the request body	
	  	req.sessionToken = req.body.token;
        store.createSession(req, sess);
        next();
      }
    });
  };
};
