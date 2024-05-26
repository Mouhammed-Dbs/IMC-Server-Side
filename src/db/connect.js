const mongoose = require("mongoose");

function connect() {
  mongoose.connect(process.env.PROD_DB_URL);
  mongoose.connection.on("error", (err) => {
    console.log("Error connect to DB");
  });
  mongoose.connection.on("connected", (err) => {
    console.log("DB connected");
  });
}

module.exports = connect;
