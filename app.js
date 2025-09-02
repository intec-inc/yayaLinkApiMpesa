const express = require("express");
const request = require("request");
const bodyParser = require("body-parser");
const app = express();
const cors = require("cors");
const fs = require("firebase-admin");

///-----Port-----///
const port = app.listen(process.env.PORT || 4114);
const _urlencoded = express.urlencoded({ extended: false });
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

///----FireStore ----//
const serviceAccount = require("./servicekey.js");


fs.initializeApp({
  credential: fs.credential.cert(serviceAccount),
});

console.log('Firebase initialized successfully!');


const db = fs.firestore();

//----AllOW ACCESS -----//
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "PUT, POST, PATCH, DELETE, GET");
    return res.status(200).json({});
  }

  next();
});

let _checkoutRequestId, _UserID, _Username;

///------STK push Activate------/////

app.post("/stk", access, _urlencoded, function (req, res) {
  let _phoneNumber = req.body.phone;
  let _Amount = req.body.amount;
  _UserID = req.body.user_id;
  _Username = req.body.User_name;

  let endpoint = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
  let auth = "Bearer " + req.access_token;

  let _shortCode = "4087943";
  let _passKey =
    "bb2724f53956f05ca6772b8a79e193c88953048d221b8f4f47d96c9b8f641dbb";

  const timeStamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, -3);
  const password = Buffer.from(`${_shortCode}${_passKey}${timeStamp}`).toString(
    "base64"
  );

  request(
    {
      url: endpoint,
      method: "POST",
      headers: {
        Authorization: auth,
      },

      json: {
        BusinessShortCode: _shortCode,
        Password: password,
        Timestamp: timeStamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: _Amount,
        PartyA: _phoneNumber,
        PartyB: _shortCode, //Till  No.
        PhoneNumber: _phoneNumber,
        CallBackURL: "https://yayampesapii.herokuapp.com/stk_callback",
        AccountReference: "Yaya Nanies App",
        TransactionDesc: "_transDec",
      },
    },
    (error, response, body) => {
      if (error) {
        console.log(error);
        res.status(404).json(error);
      } else {
        res.status(200).json(body);
        console.log(body);
        console.log("USER_ID", _UserID);
        console.log("USER_Name", Username);

        _checkoutRequestId = body.CheckoutRequestID;
        console.log("CHECKOUT_ID", _checkoutRequestId);
      }
    }
  );
});
//----MIDDLEWARE---///
const middleware = (req, res, next) => {
  req.checkoutID = _checkoutRequestId;
  req.uid = _UserID;
  req.name = _Username;
  next();
};

///------STK_CALLBACK-----///
app.post("/stk_callback", _urlencoded, middleware, function (req, res, next) {
  var transID = "";
  var amount = "";
  var transdate = "";
  var transNo = "";
  let _checkout_ID = req.checkoutID;
  let _Name = req.name;
  let _UID = req.uid;

  console.log(".......... STK Callback ..................");
  if (res.status(200)) {
    console.log("CheckOutId", _checkout_ID);

    res.json(req.body.Body.stkCallback.CallbackMetadata);
    console.log(req.body.Body.stkCallback.CallbackMetadata);

    if (
      (Balance =
        req.body.Body.stkCallback.CallbackMetadata.Item[2].Name == "Balance")
    ) {
      amount = req.body.Body.stkCallback.CallbackMetadata.Item[0].Value;
      transID = req.body.Body.stkCallback.CallbackMetadata.Item[1].Value;
      transNo = req.body.Body.stkCallback.CallbackMetadata.Item[4].Value;
      transdate = req.body.Body.stkCallback.CallbackMetadata.Item[3].Value;

      db.collection("Payments_backup")
        .doc(transID)
        .set({
          mpesaReceipt: transID,
          paidAmount: amount,
          transNo: transNo,
          Doc_ID: _UID,
          Details: "Candidate fee",
          checkOutReqID: _checkout_ID,
          user_Name: _Name,
          timestamp: transdate,
        })
        .then((ref) => {
          console.log("Added doc with ID: ", transID);

          var sfDocRef = db.collection("Admin").doc("Total_amount");

          db.runTransaction((transaction) => {
            return transaction.get(sfDocRef).then((sfDoc) => {
              if (!sfDoc.exists) {
                throw "Document does not exist!";
              }
              var newAmount = sfDoc.data().Total_income;
              var total_amount = newAmount + amount;
              transaction.update(sfDocRef, { Total_income: total_amount });
              return total_amount;
            });
          })
            .then((total_credit) => {
              console.log("Total_Amount increased to ", total_amount);
            })
            .catch((err) => {
              // This will be an "population is too big" error.
              console.error(err);
            });

          ///-----Admin section -----//

          db.collection("Yaya_Employer")
            .doc(_UID)
            .update({
              preference_count: true,
              mpesa_receipt: transID,
              checkOutReqID: _checkout_ID,
              payment_date: new Date(),
            })
            .then((ref) => {
              console.log("Notification sent", transID);
            });

          ////------Close Admin -----////
        });

      db.collection("Yaya_Employer")
        .doc(_UID)
        .collection("Notifications")
        .doc()
        .set({
          title: "Mpesa payment",
          desc: _Name + " you have successfully a paid ksh/" + amount,
          type: "Mpesa payment",
          to: _UID,
          status: "none",
          from: _UID,
          timestamp: new Date(),
        })
        .then((ref) => {
          console.log("Notification sent", transID);
        });
    } else {
      amount = req.body.Body.stkCallback.CallbackMetadata.Item[0].Value;
      transID = req.body.Body.stkCallback.CallbackMetadata.Item[1].Value;
      transNo = req.body.Body.stkCallback.CallbackMetadata.Item[3].Value;
      transdate = req.body.Body.stkCallback.CallbackMetadata.Item[2].Value;

      db.collection("Payments_backup")
        .doc(transID)
        .set({
          mpesaReceipt: transID,
          paidAmount: amount,
          transNo: transNo,
          Doc_ID: _UID,
          Details: "Candidate fee",
          checkOutReqID: _checkout_ID,
          user_Name: _Name,
          timestamp: transdate,
          User_id: _UID,
        })
        .then((ref) => {
          console.log("Payments_backup Added", transID);
          var sfDocRef = db.collection("Admin").doc("Total_amount");
          db.runTransaction((transaction) => {
            return transaction.get(sfDocRef).then((sfDoc) => {
              if (!sfDoc.exists) {
                throw "Document does not exist!";
              }
              var newAmount = sfDoc.data().Total_income;
              var total_amount = newAmount + amount;
              transaction.update(sfDocRef, { Total_income: total_amount });
              return total_amount;
            });
          })
            .then((total_credit) => {
              console.log("Total_Amount increased to ", total_amount);
            })
            .catch((err) => {
              // This will be an "population is too big" error.
              console.error(err);
            });

          ///-----Admin section -----//

          db.collection("Yaya_Employer")
            .doc(_UID)
            .update({
              preference_count: true,
              mpesa_receipt: transID,
              checkOutReqID: _checkout_ID,
              payment_date: new Date(),
            })
            .then((ref) => {
              console.log("Receipt added", transID);
            });

          ////------Close Admin -----////
        });

      db.collection("Yaya_Employer")
        .doc(_UID)
        .collection("Notifications")
        .doc()
        .set({
          title: "Mpesa payment",
          desc: _Name + " you have successfully a paid ksh/" + amount,
          type: "Mpesa payment",
          to: _UID,
          status: "none",
          from: _UID,
          timestamp: new Date(),
        })
        .then((ref) => {
          console.log("Notification sent", transID);
        });
    }
  }
});
///----STK QUERY ---//
app.post("/stk/query", access, _urlencoded, function (req, res, next) {
  let _checkoutRequestId = req.body.checkoutRequestId;

  auth = "Bearer " + req.access_token;

  let endpoint = "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query";
  let _shortCode = "4087943";
  let _passKey =
    "bb2724f53956f05ca6772b8a79e193c88953048d221b8f4f47d96c9b8f641dbb";

  const timeStamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, -3);
  const password = Buffer.from(`${_shortCode}${_passKey}${timeStamp}`).toString(
    "base64"
  );

  request(
    {
      url: endpoint,
      method: "POST",
      headers: {
        Authorization: auth,
      },

      json: {
        BusinessShortCode: _shortCode,
        Password: password,
        Timestamp: timeStamp,
        CheckoutRequestID: _checkoutRequestId,
      },
    },
    function (error, response, body) {
      if (error) {
        console.log(error);
        res.status(404).json(body);
      } else {
        res.status(200).json(body);
        console.log(body);
        next();
      }
    }
  );
});

///-------  Stk Registration-----////
let _BfName,
  _BureauImage,
  _BureauName,
  _BIdNo,
  _BBuilding,
  _BStreetName,
  _BCity,
  _BCounty,
  _BEmail,
  _BBox,
  _BPostalCode,
  _BPhone,
  _BAmount,
  _BUiD;
let _CheckoutRequestId;

app.post("/stk_register", access, _urlencoded, function (req, res) {
  _BPhone = req.body.Phone_NO;
  _BAmount = req.body.amount;
  _BUiD = req.body.user_id;
  _BfName = req.body.userName;

  let endpoint = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
  let auth = "Bearer " + req.access_token;

  let _shortCode = "4087943";
  let _passKey =
    "bb2724f53956f05ca6772b8a79e193c88953048d221b8f4f47d96c9b8f641dbb";

  const timeStamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, -3);
  const password = Buffer.from(`${_shortCode}${_passKey}${timeStamp}`).toString(
    "base64"
  );

  request(
    {
      url: endpoint,
      method: "POST",
      headers: {
        Authorization: auth,
      },

      json: {
        BusinessShortCode: _shortCode,
        Password: password,
        Timestamp: timeStamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: _BAmount,
        PartyA: _BPhone,
        PartyB: _shortCode, //Till  No.
        PhoneNumber: _BPhone,
        CallBackURL: "https://yayampesapii.herokuapp.com/stk_callback2",
        AccountReference: "Yaya Bureau App ",
        TransactionDesc: "_transDec",
      },
    },
    (error, response, body) => {
      if (error) {
        console.log(error);
        res.status(404).json(error);
      } else {
        res.status(200).json(body);
        console.log(body);
        console.log("USER_ID", _BUiD);
        _CheckoutRequestId = body.CheckoutRequestID;
        console.log("CHECKOUT_ID", _CheckoutRequestId);
      }
    }
  );
});
//----MIDDLEWARE---///
const middleware2 = (req, res, next) => {
  req.checkoutID = _CheckoutRequestId;
  req.uid = _BUiD;
  req.name = _BfName;
  next();
};

///------STK_CALLBACK-----///
app.post("/stk_callback2", _urlencoded, middleware2, function (req, res, next) {
  var transID = "";
  var amount = "";
  var transdate = "";
  var transNo = "";
  let _checkout_ID = req.checkoutID;
  let _UiD = req.uid;
  let _Name = req.name;
  var total_amount;
  console.log(".......... STK Callback ..................");
  if (res.status(200)) {
    console.log("CheckOutId", _checkout_ID);

    res.json(req.body.Body.stkCallback.CallbackMetadata);
    console.log(req.body.Body.stkCallback.CallbackMetadata);

    if (
      (Balance =
        req.body.Body.stkCallback.CallbackMetadata.Item[2].Name == "Balance")
    ) {
      amount = req.body.Body.stkCallback.CallbackMetadata.Item[0].Value;
      transID = req.body.Body.stkCallback.CallbackMetadata.Item[1].Value;
      transNo = req.body.Body.stkCallback.CallbackMetadata.Item[4].Value;
      transdate = req.body.Body.stkCallback.CallbackMetadata.Item[3].Value;

      db.collection("Payments_backup")
        .doc(transID)
        .set({
          mpesaReceipt: transID,
          paidAmount: amount,
          transNo: transNo,
          Doc_ID: _UiD,
          Details: "Registration fee",
          checkOutReqID: _checkout_ID,
          user_Name: _Name,
          timestamp: transdate,
        })
        .then((ref) => {
          console.log("BackUP Added doc with ID: ", transID);

          ///-----Admin section -----//

          var sfDocRef99 = db.collection("Admin").doc("Total_amount");

          db.runTransaction((transaction) => {
            return transaction.get(sfDocRef99).then((sfDoc) => {
              if (!sfDoc.exists) {
                throw "Document does not exist!";
              }
              var newAmount = sfDoc.data().Total_income;
              total_amount = newAmount + amount;
              transaction.update(sfDocRef99, {
                Total_income: total_amount,
              });
              return total_amount;
            });
          })
            .then((total_amount) => {
              console.log("Total_Amount increased to ", total_amount);
            })
            .catch((err) => {
              // This will be an "population is too big" error.
              console.error(err);
            });

          db.collection("Yaya_Bureau")
            .doc(_UiD)
            .update({
              preference_count: true,
              mpesa_receipt: transID,
              checkOutReqID: _checkout_ID,
              RegistrationFee: amount,
              timestamp: new Date(),
            })
            .then((ref) => {
              console.log("Data stored", transID);

              db.collection("Yaya_Bureau")
                .doc(_UiD)
                .collection("Notifications")
                .doc()
                .set({
                  title: "Mpesa payment",
                  desc:
                    _Name +
                    " you have successfully a paid ksh/" +
                    amount +
                    " for registration fee",
                  type: "Mpesa payment",
                  to: _UiD,
                  status: "none",
                  from: _UiD,
                  timestamp: new Date(),
                })
                .then((ref) => {
                  console.log("Notification sent", transID);
                });
            });

          ////------Close Admin -----////
        });
    } else {
      amount = req.body.Body.stkCallback.CallbackMetadata.Item[0].Value;
      transID = req.body.Body.stkCallback.CallbackMetadata.Item[1].Value;
      transNo = req.body.Body.stkCallback.CallbackMetadata.Item[3].Value;
      transdate = req.body.Body.stkCallback.CallbackMetadata.Item[2].Value;

      db.collection("Payments_backup")
        .doc(transID)
        .set({
          mpesaReceipt: transID,
          paidAmount: amount,
          transNo: transNo,
          Doc_ID: _UiD,
          Details: "Registration fee",
          checkOutReqID: _checkout_ID,
          user_Name: _Name,
          timestamp: transdate,
          User_id: _UiD,
        })
        .then((ref) => {
          console.log("backUp Added doc with ID: ", transID);
        });

      var sfDocRef = db.collection("Admin").doc("Total_amount");

      db.runTransaction((transaction) => {
        return transaction.get(sfDocRef).then((sfDoc) => {
          if (!sfDoc.exists) {
            throw "Document does not exist!";
          }
          var newAmount = sfDoc.data().Total_income;
          total_amount = newAmount + amount;
          transaction.update(sfDocRef, { Total_income: total_amount });
          return total_amount;
        });
      })
        .then((total_credit) => {
          console.log("Total_Amount increased to ", total_amount);
        })
        .catch((err) => {
          // This will be an "population is too big" error.
          console.error(err);
        });

      ///-----Admin section -----//
      db.collection("Yaya_Bureau")
        .doc(_UiD)
        .update({
          preference_count: true,
          mpesa_receipt: transID,
          checkOutReqID: _checkout_ID,
          RegistrationFee: amount,
          timestamp: new Date(),
        })
        .then((ref) => {
          console.log("Data added", _UiD);

          ///-----Notifications -----//
          db.collection("Yaya_Bureau")
            .doc(_UiD)
            .collection("Notifications")
            .doc()
            .set({
              title: "Mpesa payment",
              desc:
                _Name +
                " you have successfully a paid ksh/" +
                amount +
                " for registration fee",
              type: "Mpesa payment",
              to: _UiD,
              status: "none",
              from: _UiD,
              timestamp: new Date(),
            })
            .then((ref) => {
              console.log("Notification sent", _UiD);
            });

          ///-----END Notifications -----//
        });
      ////------Close Admin -----////
    }
  }
});
///----STK QUERY ---//
app.post("/stk/query2", access, _urlencoded, function (req, res, next) {
  let _checkoutRequestId = req.body.checkoutRequestId;

  auth = "Bearer " + req.access_token;

  let endpoint = "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query";
  let _shortCode = "4087943";
  let _passKey =
    "bb2724f53956f05ca6772b8a79e193c88953048d221b8f4f47d96c9b8f641dbb";

  const timeStamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, -3);
  const password = Buffer.from(`${_shortCode}${_passKey}${timeStamp}`).toString(
    "base64"
  );

  request(
    {
      url: endpoint,
      method: "POST",
      headers: {
        Authorization: auth,
      },

      json: {
        BusinessShortCode: _shortCode,
        Password: password,
        Timestamp: timeStamp,
        CheckoutRequestID: _checkoutRequestId,
      },
    },
    function (error, response, body) {
      if (error) {
        console.log(error);
        res.status(404).json(body);
      } else {
        res.status(200).json(body);
        console.log(body);
        next();
      }
    }
  );
});

////-----ACCESS_TOKEN-----
app.get("/access_token", access, (req, res) => {
  res.status(200).json({ access_token: req.access_token });
});

function access(res, req, next) {
  let endpoint =
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  let auth = new Buffer.from(
    "zvvGuwDPUGvG7EPKlD0x0eA4Isq7CP5p:5xCnqwluYEFlWOLG"
  ).toString("base64");

  request(
    {
      url: endpoint,
      headers: {
        Authorization: "Basic  " + auth,
      },
    },
    (error, response, body) => {
      if (error) {
        console.log(error);
      } else {
        res.access_token = JSON.parse(body).access_token;
        console.log(body);
        next();
      }
    }
  );
}
///----END ACCESS_TOKEN---

/////-----Home ------/////
app.get("/", (req, res, next) => {
  res.status(200).send("Hello welcome to Yaya Mpesa API");
});

//-- listen
app.listen(port ,'0.0.0.0', (error) => {
  if (error) {
  } else {
    console.log(`Server running on port http://localhost:${port}`);
  }
});
