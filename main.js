var Libbeacon = require("libbeacon");
var fs = require('fs');
var serialize = require('node-serialize');
var qs = require('qs');
var mysql = require('mysql');
var async = require('async');
var nodemailer = require('nodemailer');
var util = require('util')

var cachefile = "./hashcache.json"


var transporter = nodemailer.createTransport({
  host: 'smtp.office365.com', // Office 365 server
        port: 587,     // secure SMTP
        secure: false, // false for TLS - as a boolean not string - but the default is false so just remove this completely
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          ciphers: 'SSLv3'
        }
      });

var mailOptions = {
  from: process.env.EMAIL_USER,
  to: process.env.EMAIL_TO,
  subject: 'SESLogin NITC Generator',
  text: ''
};

mailOptions.text="Run started at "+new Date().toISOString()+"\n\n"

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
  var membersInBatch = {}


  async.series([
    function getRecordsFromMysql(step) {
      mailOptions.text = mailOptions.text+"\nStarting SQL"

      connection.connect();
      var oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate()-90);
      oneDayAgo.setTime(oneDayAgo.valueOf() - 60000 * oneDayAgo.getTimezoneOffset());
      var oneDayAgoSeconds = Math.round(oneDayAgo.getTime() / 1000)
      console.log(oneDayAgoSeconds)
            //Parramatta and only other,training,assess events, which have end times,  limit 100 for safety
            connection.query('SELECT periods.id,periods.starttime,periods.endtime,periods.categoryid,members.serialnumber,categories.name FROM periods LEFT JOIN members ON members.id = periods.memberid LEFT JOIN categories ON categories.id = periods.categoryid WHERE periods.locationid = "5" AND periods.categoryid REGEXP \'^(1|3|6|7|8)\' AND endtime IS NOT NULL AND endtime > ? ORDER BY periods.id DESC', oneDayAgoSeconds, function (error, results, fields) {
              if (error) throw error;
              results.forEach(function(res){
                if (cache.indexOf(res.id) == -1) { //not in the cache AKA i have not seen this record before
                  var memberID = res.serialnumber
                  var startdate = new Date(res.starttime*1000);
                  var enddate = new Date(res.endtime*1000);
                  var categoryId = res.categoryid
                  var categoryName = res.name
                  mysqlResults.push({memberID: memberID, startdate: startdate, enddate: enddate,categoryId: categoryId, categoriesname: categoryName}) //hold these off in an array
                  cache.push(res.id);
                  mailOptions.text = mailOptions.text+"\nWILL process row #"+res.id
                  console.log("WILL process row #"+res.id)

                } else {
                  mailOptions.text = mailOptions.text+"\nNOT processing an already seen row #"+res.id
                  console.log("NOT processing an already seen row #"+res.id)
                }
              })
              connection.end();
              mailOptions.text = mailOptions.text+"\nFinished SQL"

              step();
            })
},

function getIDFromBeacon(step) {
  //login to beacon, and hold the sesison open for later
  if (mysqlResults.length > 0)
  {
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

    var rowsprocessed = 0
  mysqlResults.forEach(function(row){ //walk the mysql results
   getMemberDbId(row.memberID,function(mid){ //for every returned result from beacon
    rowsprocessed++
    if (mid != null)
    {
      if (membersInBatch[row.categoryId] === undefined)
      {
        membersInBatch[row.categoryId] = {}
        membersInBatch[row.categoryId]['participants'] = []
        membersInBatch[row.categoryId]['categoryName'] = row.categoriesname
      }

    console.log("Member BID is "+mid) //BID is background id (database record id kinda thing)

    participant = {}
    participant.Id = 0
    participant.PersonId = mid
    participant.StartDate = row.startdate
    participant.EndDate = row.enddate


    membersInBatch[row.categoryId]['participants'].push(participant)
  }
  if (rowsprocessed == mysqlResults.length) //shitty way to know when they are all back
  {
    step();
  }
})
 })
})
} else {
  console.log("Not Logging in, no records to process")
  mailOptions.text=mailOptions.text+"\n\nRun ended at "+new Date().toISOString()+"\n\n"

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
  step();
}
},

function workOnNICT(step) {

  var role_Dictionary = {
    101 : [398], //Admin General
    102 : [399], //Admin Training
    103 : [400], //Assessment Supervision
    104 : [401], //Exercise Non SES
    105 : [402], //Exercise SES
    106 : [403], //Attend Other
    107 : [404], //Attend unit
    108 : [408], //Attend State
    109 : [409], //Attend workshop
    110 : [410], //driver revive
    111 : [414], //Duty Officer
    112 : [411], //LEMC
    113 : [412], //building maint
    114 : [413], //equip maint
    115 : [407], //attend region
    116 : [405], // OOA
    117 : [396], //admin
    //The 600's which are training
    602 : [316,317,318], //chainsaw
    603 : [319], //comms
    604 : [322],//Critical Incident Support
    605 : [314], //Beacon
    606 : [325], //First Aid
    607 : [358],//Floodboat
    608 : [339], //PIARO
    609 : [328], //Fundamentals
    610 : [368], // Maint Team Safety
    611 : [369, 370], //Navigation
    612 : [336], //OHS
    613 : [381], //Ops
    614 : [340], //RCR
    615 : [338], //Trainig setup...338 is other
    616 : [373], //Storm
    617 : [359], //L3
    619 : [348, 379, 380], //USAR
    620 : [353], //DOV
    622 : [349], //Vertical
    622 : [330], //AIMS

    700 : [338], //trainer
    701 : [349], //VR
    702 : [316,317,318], //chainsaw
    703 : [353], //DOV
    704 : [348, 379, 380], //USAR
    705 : [327], //Swift
    706 : [373], //Storm
    707 : [340], //RCR
    708 : [369,370], //Nav
    709 : [339], //PIRO
    710 : [358], //Floodboat
    711 : [314], //Beacon
    712 : [319], //Comms
    713 : [368], //MTS
    714 : [328], //Fundamentals
    715 : [325], //Firstaid
    716 : [369,370], //Map
    717 : [330], //AIIMS

    /// 338 is Other

  };


  var numberSubmitted = 0
  for (var category in membersInBatch) { //category XYZ
    var earliestStart = null
    var latestEnd = null

    for (var entry in membersInBatch[category]['participants']) { //category XYZ
      var thisStart = new Date(membersInBatch[category]['participants'][entry]['StartDate'])
      var thisEnd = new Date(membersInBatch[category]['participants'][entry]['EndDate'])

      if (earliestStart === null) {
        earliestStart = thisStart
      }
      if (latestEnd === null) {
        latestEnd = thisEnd
      }


      if (thisStart < earliestStart)
      {
        earliestStart = thisStart
      }

      if (thisEnd > latestEnd)
      {
        latestEnd = thisEnd
      }

      //partifipant types
      var firstdigit = category[0]
      switch (firstdigit){
        case '1': //Other
        membersInBatch[category]['participants'][entry]['TypeId'] = 1 //Atendee
        break
        case '2': //Combat *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['participants'][entry]['TypeId'] = 1 //Atendee
        break
        case '3': //Comm Ed
        membersInBatch[category]['participants'][entry]['TypeId'] = 1 //Atendee
        break
        case '4': //Rescue *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['participants'][entry]['TypeId'] = 1 //Atendee
        break
        case '5': //Support *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['participants'][entry]['TypeId'] = 1 //Atendee
        break
        case '6': //Training
        membersInBatch[category]['participants'][entry]['TypeId'] = 1 //Atendee
        break
        case '7': //Trainer
        membersInBatch[category]['participants'][entry]['TypeId'] = 2 //Atendee
        break
        case '8': //Assess
        membersInBatch[category]['participants'][entry]['TypeId'] = 3 //Atendee
        break
      }




    }

    membersInBatch[category]['startTime'] = earliestStart
    membersInBatch[category]['endTime'] = latestEnd

    //event types
    var firstdigit = category[0]
    switch (firstdigit){
        case '1': //Other
        membersInBatch[category]['type'] = 3 //Other Other
        break
        case '2': //Combat *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['type'] = 3 //Other Other
        break
        case '3': //Comm Ed
        membersInBatch[category]['type'] = 2 //Comm Ed Other
        break
        case '4': //Rescue *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['type'] = 3 //Other Other
        break
        case '5': //Support *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['type'] = 3 //Other Other        
        break
        case '6': //Training
        membersInBatch[category]['type'] = 1 //Training Other
        break
        case '7': //Trainer
        membersInBatch[category]['type'] = 1 //Other Other
        break
        case '8': //Assess
        membersInBatch[category]['type'] = 1 //Other Other
        break
      }

      if (role_Dictionary[category] !== undefined)
      {
        console.log("this one matches")
        membersInBatch[category]['tags'] = role_Dictionary[category]
      } else {
        console.log("no match, will work out a default for "+category)
        var firstdigit = category[0]
        switch (firstdigit){
        case '1': //Other
        membersInBatch[category]['tags'] = [414] //Other Other
        break
        case '2': //Combat *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['tags'] = [414] //Other Other
        break
        case '3': //Comm Ed
        membersInBatch[category]['tags'] = [388] //Comm Ed Other
        break
        case '4': //Rescue *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['tags'] = [414] //Other Other
        break
        case '5': //Support *WONT SEE THIS DUE TO SQL SELECT*
        membersInBatch[category]['tags'] = [414] //Other Other        
        break
        case '6': //Training
        membersInBatch[category]['tags'] = [338] //Training Other
        break
        case '7': //Trainer
        membersInBatch[category]['tags'] = [414] //Other Other
        break
        case '8': //Assess
        membersInBatch[category]['tags'] = [414] //Other Other
        break
      }
    }

    //Make the NITC

    parentform = {}
    parentform.TypeId = membersInBatch[category]['type']
    parentform.Name = "SESLOGIN Auto - "+membersInBatch[category]['categoryName']
    parentform.Description = membersInBatch[category]['categoryName']
    parentform.TagIds = membersInBatch[category]['tags']

    parentform.StartDate = membersInBatch[category]['startTime']
    parentform.EndDate = membersInBatch[category]['endTime']
          ///


     //mash the two arrays together (new ones plus ones that are already there)

     parentform.Participants = membersInBatch[category]['participants']

     console.log(parentform)

          //post it all to beacon
          beacon.get('NonIncident', {
            method: 'POST',
            form: qs.stringify(parentform)
          },
          function(error, data) {
            if (error) {
              console.log("NITC Error:"+error)
              console.log(data)
              numberSubmitted++

              if (numberSubmitted = Object.keys(membersInBatch).length)
              {
                console.log("All Done")
                step();
              }
            }
            if (!error) {
              console.log("NITC Sent without HTTP error. this is good")
              console.log(data)
              console.log('NITC EVENT ID IS '+data.Id)

              mailOptions.text= mailOptions.text+"\n\n\nCreated Event #"+data.Id+ "\nName: "+data.Name+"\nDescription: "+data.Description+"\nURL: http://previewbeacon.ses.nsw.gov.au/nitc/"+data.Id+"\n"+util.inspect(data.Participants, false, null)


             // Close the Event
             beacon.get('NonIncident/'+data.Id+'/completed?completed=true', {
              method: 'POST'
            },
            function(error, data) {
             if (error) {
              console.log("NITC Error:"+error)
            }
            if (!error) {
              console.log("NITC Closed without HTTP error. this is good")
              numberSubmitted++

              if (numberSubmitted == Object.keys(membersInBatch).length)
              {
                console.log("All Done")
                step();
              }

            }

          })
           }
         })

}
},
function finishUp(step) {
 //write out what we have done into cache
 fs.writeFileSync(cachefile, JSON.stringify(cache), 'utf-8');
 mailOptions.text=mailOptions.text+"\n\nRun ended at "+new Date().toISOString()+"\n\n"

 transporter.sendMail(mailOptions, function(error, info){
  if (error) {
    console.log(error);
  } else {
    console.log('Email sent: ' + info.response);
  }
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
