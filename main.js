var Libbeacon = require("libbeacon");
var fs = require('fs');
var serialize = require('node-serialize');
var qs = require('qs');
var mysql      = require('mysql');
var async = require('async');

var cachefile = "./hashcache.json"


//ID of the NITC we want to add members to.
var nitcID = process.env.BEACON_NITCID


var connection = mysql.createConnection({
  host     : 'localhost',
  user     : process.env.SESLOGIN_USER,
  password : process.env.SESLOGIN_PASS,
  database : process.env.SESLOGIN_DB
});

function main() {
  console.log("Running main loop")


  var beacon = new Libbeacon();
  var cache = [];

  //open the hash file if exists
  //used to store what ID's have been procesed to avoid dupes
  fs.exists(cachefile, function(fileok){
    if(fileok)fs.readFile(cachefile, function(error, data) {
      console.log(data)
      cache = JSON.parse(data);
    })
  })


  var mysqlResults = []
  var membersInBatch = []


  async.series([
    function getRecordsFromMysql(step) {
      connection.connect();
            //Parramatta and only other,training,assess events, which have end times,  limit 100 for safety
            connection.query('SELECT periods.id,periods.starttime,periods.endtime,members.serialnumber FROM periods LEFT JOIN members ON members.id = periods.memberid WHERE periods.locationid = "5" AND periods.categoryid REGEXP \'^(1|6|7|8)\' AND endtime IS NOT NULL ORDER BY periods.id DESC LIMIT 100', function (error, results, fields) {
              if (error) throw error;
              results.forEach(function(res){
                console.log(res)
                if (cache.indexOf(res.id) == -1) { //not in the cache AKA i have not seen this record before
                  var memberID = res.serialnumber
                  var startdate = new Date(res.starttime*1000);
                  var enddate = new Date(res.endtime*1000);
                  mysqlResults.push({memberID: memberID, startdate: startdate, enddate: enddate}) //hold these off in an array
                  cache.push(res.id);
                  console.log("WILL process row #"+res.id)

                } else {
                  console.log("Not processing an already seen row #"+res.id)
                }
              })
              connection.end();
              step();
            })
},

function getIDFromBeacon(step) {
  //login to beacon, and hold the sesison open for later
  beacon.login(process.env.BEACON_USERNAME, process.env.BEACON_PASSWORD, function(err, success) {

   if(err) {
    console.log(err);
    return;
  }

  if(!success) {
    console.log("Abort: Invalid beacon credentials");
    return;
  }

  if(success) {
    console.log("Login OK!");
  }


  mysqlResults.forEach(function(row){ //walk the mysql results
   getMemberDbId(row.memberID,function(mid){ //for every returned result from beacon
    console.log("Member BID is "+mid) //BID is background id (database record id kinda thing)

    participant = {}
    participant.Id = 0
    participant.PersonId = mid
    participant.StartDate = row.startdate
    participant.EndDate = row.enddate
    participant.TypeId = 1
    membersInBatch.push(participant)

    if (membersInBatch.length == mysqlResults.length) //shitty way to know when they are all back
    {
      step();
    }

  })
 })
})
},
function workOnNICT(step) {
  processedBatch = []

        //cleanup ones that came back and didnt find a member ID
        membersInBatch.forEach(function(row){
          if (row.PersonId != null)
          {
            processedBatch.push(row)
          }
        })
        //get the NICT event we want to update
        beacon.get('NonIncident/'+nitcID, {}, function(error, data) {

          //Clone all the info and get it ready to be re-posted
          parentform = {}
          parentform.Id= data.Id
          parentform.TypeId = data.Type.Id
          parentform.Name = data.Name
          parentform.Description = data.Description
          parentform.TagIds = []
          data.Tags.forEach(function(v){
            parentform.TagIds.push(v.Id)  
          })
          parentform.StartDate = data.StartDate
          parentform.EndDate = data.EndDate
          ///

          currentParticipants = data.Participants

          //clone the participants for reposting
          currentParticipants.forEach(function(v){
                //tidy them up so they can be reposted
                v.PersonId = v.Person.Id
                v.TypeId = v.ParticipantType.Id
                delete(v.Person)
                delete(v.ParticipantType)
                //
              })

          //mash the two arrays together (new ones plus ones that are already there)
          var newNICTMembers = currentParticipants.concat(processedBatch)

          parentform.Participants = newNICTMembers

          console.log(parentform)

          //post it all to beacon
          beacon.get('NonIncident/'+nitcID, {
            method: 'PUT',
            form: qs.stringify(parentform)
          },
          function(error, data) {
            if (error) {
              console.log("NITC Error:"+error)
            }
            if (!error) {
              console.log("NITC Sent without HTTP error. this is good")
              //write out what we have done into cache
              fs.writeFileSync(cachefile, JSON.stringify(cache), 'utf-8');

            }
          })

        });
}
])


function getMemberDbId(membernumber,cb){
  //function to take in a member ID and return a database ID
  beacon.get('People/Search?'+"RegistrationNumber="+membernumber, {method: 'GET'}, function(error, data) {
    if (data.Results.length == 1)
    {
      console.log("getMemberDbId CB with "+data.Results[0].Id)
      cb(data.Results[0].Id)
    } else {
      cb(null)
    }
  })
}

}




main();
