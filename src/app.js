require("dotenv").config();
const express = require("express");
const cors = require("cors");
const errorHandler = require("./middlewares/errorHandler");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const connectDB = require("./db/connect");

const app = express();
app.use(cors());
app.use(express.json());

connectDB();
app.use("/user", authRoutes);
app.use("/user", userRoutes);
app.use("/doctors", doctorRoutes);
app.use("/sessions", sessionRoutes);

// Global error handling middleware
app.use(errorHandler);
// app.use(errorsHandler.error);

app.listen(5000, () => {
  console.log(`Server is running on http://localhost:5000`);
});
