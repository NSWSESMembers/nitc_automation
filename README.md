# nitc_automation

Code for automating NITC submissions from SESLogin into beacon.

Designed to run every X and will make seperate NITC events for each cagetory that members have done in that period.

Once done will send an email with a bit of debug about what it has done.

I run it with a bash script to get the evn up


```
#!/bin/bash

export BEACON_USERNAME=foo
export BEACON_PASSWORD=bar
export SESLOGIN_USER=cant tell you this
export SESLOGIN_PASS=or this
export SESLOGIN_DB=dbname 
export EMAIL_USER=something@ses.nsw.gov.au
export EMAIL_PASS=password
export EMAIL_TO=person_who_cares@member.ses.nsw.gov.au

node main.js
```


## License
[MIT](LICENSE)
