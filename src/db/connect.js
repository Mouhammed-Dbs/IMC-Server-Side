const mongoose = require("mongoose");

function connect() {
  mongoose.connect(process.env.PROD_DB_URL);
  mongoose.connection.on("error", (err) => {
    console.log(err);
  });
  mongoose.connection.on("connected", (err) => {
    console.log("DB connected");
  });
}

module.exports = connect;
