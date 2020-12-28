var express = require('express');
var router = express.Router();
var mysql = require('mysql');
const twilioKeys = require('./twilio_auth.json');
const twilioClient = require('twilio')(twilioKeys.accountSid, twilioKeys.authToken);

const {
	JWT
} = require('google-auth-library');
const keys = require('./creds.json');
const {
	google
} = require('googleapis');
var con = mysql.createConnection({
		host: "localhost",
		user: "ADMIN",
		password: "ADMIN",
		database: "vehicle_database",
		insecureAuth: true
	});
const client = new JWT({
		email: keys.client_email,
		key: keys.private_key,
		scopes: ['https://www.googleapis.com/auth/calendar'],
	});
var connected = false;
var new_event;
router.get('/', function (req, res) {
	res.send("");
})
router.get('/add_repo', function (req, res) {
	res.sendfile("./public/add_repo.html");
})
router.post('/add_repo', function (req, res) {
	if (!connected) {
		connected = true;
		con.connect();
	}
	var sql = "INSERT INTO Vehicles (VIN, DebtorName, CoDebtorName, Make, Model, Year) VALUES ('" + req.body.vin_field + "', '" + req.body.name_field + "', '" + req.body.co_name_field + "', '" + req.body.make_field + "', '" + req.body.model_field + "', '" + req.body.year_field + "')";
	con.query(sql, function (err, result) {
		if (err)
			throw err;
		console.log("1 record inserted");
	});
	res.sendfile("./public/add_repo.html");
})
router.get('/modify_status', function (req, res) {
	res.sendfile("./public/modify_status.html");
})
router.post('/modify_status', function (req, res) {
	if (!connected) {
		connected = true;
		con.connect();
	}
	var sql = "UPDATE Vehicles SET PropReady = " + req.body.prop_ready + ", RedemptionReady = " + req.body.veh_red_ready + ", TransportReady = " + req.body.veh_trans_ready + " WHERE VIN = '" + req.body.vin_field + "';";
	con.query(sql, function (err, result) {
		if (err)
			throw err;
		console.log("1 record modified");
	});
	res.sendfile("./public/modify_status.html");
})
router.get('/create_event', function (req, res) {
	res.sendfile("./public/create_event.html");
})
router.post('/create_event', function (req, res) {
	if (!connected) {
		connected = true;
		con.connect();
	}
	var sql = "SELECT * FROM Vehicles WHERE VIN = '" + req.body.vin_field + "' AND  " + req.body.appointment_type + " = 1 AND eventID IS NULL;";
	con.query(sql, function (err, result) {
		if (err)
			throw err;
		console.log(result);
		if (result.length > 0) {
			const calendar = google.calendar('v3', client);
			var startTime = new Date(req.body.appointment_date + "T" + req.body.appt_time + "-05:00");
			var endTime = new Date(startTime.getTime() + 15 * 60000); //15 minutes later
			const id = Date.now();
			var event = {
				'summary': req.body.appointment_type + " FOR " + req.body.vin_field,
				'location': 'Repo Lot',
				'description': 'Come Pick up the Vehicle/Property',
				'start': {

					'dateTime': startTime.toISOString(),
					'timeZone': 'America/New_York',
				},
				'end': {
					'dateTime': endTime.toISOString(),
					'timeZone': 'America/New_York',
				},
				'id': id

			};
			calendar.events.insert({
				auth: client,
				calendarId: 'ih3lpl9e58dllncnu7imfqhg08@group.calendar.google.com',
				resource: event,
			}, function (err, event) {
				if (err) {
					console.log('There was an error contacting the Calendar service: ' + err);
					res.send("Error Creating Event, do you already have an appointment?");
					return;
				} else {

					res.sendfile("./public/create_event.html");
				}
				console.log('Event created: %s', event.data.htmlLink);

			});
			con.query("UPDATE Vehicles SET eventID = " + id + " WHERE VIN = '" + req.body.vin_field + "';");
			if (req.body.phone != null) {
				con.query("UPDATE Vehicles SET PhoneNumber = " + req.body.phone + " WHERE VIN = '" + req.body.vin_field + "';");
                twilioClient.messages.create({
						body: 'Repo Appointment for ' + result[0].DebtorName + ' scheduled for ' + startTime.toDateString(),
						from: '+14432418318',
						to: req.body.phone
					});
			}
		} else {
			res.send("Invalid VIN, Not Ready for appointment, Or Already has an appointment");
		}

	});

})

router.get('/remove_event', function (req, res) {
	res.sendfile("./public/remove_event.html");
})

router.post('/remove_event', function (req, res) {
	if (!connected) {
		connected = true;
		con.connect();
	}
	var sql = "SELECT eventID, PhoneNumber, DebtorName FROM Vehicles WHERE VIN = '" + req.body.vin_field + "' AND eventID IS NOT NULL;"
  
		con.query(sql, function (err, result) {
            console.log(result);
			if (result.length > 0) {
				const calendar = google.calendar('v3', client);
                
				calendar.events.delete ({
					auth: client,
					calendarId: 'ih3lpl9e58dllncnu7imfqhg08@group.calendar.google.com',
					eventId: result[0].eventID
				});
                
				if (result[0].PhoneNumber != null) {
					twilioClient.messages.create({
						body: 'Repo Appointment for ' + result[0].DebtorName + ' has been Canceled',
						from: '+14432418318',
						to: result[0].PhoneNumber
					});
				}
				con.query("UPDATE Vehicles SET eventID = NULL, PhoneNumber = NULL WHERE VIN = '" + req.body.vin_field + "';")

			}
		});
	res.sendfile("./public/remove_event.html");
})
module.exports = router;
