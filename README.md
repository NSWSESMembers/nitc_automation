# nitc_automation
Code for automating NITC submissions from SES Login in this example.

I run it with a bash script to get the evn up


```
#!/bin/bash

export BEACON_USERNAME=foo
export BEACON_PASSWORD=bar
export SESLOGIN_USER=cant tell you this
export SESLOGIN_PASS=or this
export SESLOGIN_DB=dbname 
export BEACON_NITCID=123456

node main.js
```
libbeacon needs this function to work for chaning HQs

Libbeacon.prototype.setHQ = function(hq, cb) {
  if(!_.isFunction(cb))
    throw new Error('Callback not specified');
  var self = this;
  var jar = this._request.jar();
  var options = {}
  options.method = 'POST'
  options.headers = {}
  options.url = this.baseUrl + 'Account/SetCurrentHq';
  options.headers['Cookie'] = this.sessionCookieName + '=' + this.cookie;
  options.headers['User-Agent'] = this._userAgent;
  options.form = {"entityId":hq}
  options.jar = jar
  var req = this._request(options, function(error, response, body) {
    if(response.statusCode === 302) { //302 seems to be the only way to know it worked.
      var cookie;
      jar.getCookies(self.baseUrl).forEach(function(c) {
        if(c.key == self.sessionCookieName)
          cookie = c.value;
      });
    self.cookie = cookie //changing HQ sends back a new cookie. save it
    cb && cb(true)
  }
  if(error) {
    cb && cb(false);
    return;
  }
  if(response.statusCode === 403) {
    cb && cb(false);
    return
  }
});
}

## License
[MIT](LICENSE)
