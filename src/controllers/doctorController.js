const Doctor = require("../models/Doctor");

const getDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find();
    if (doctors) {
      const simplifiedDoctors = doctors.map(
        ({ _id, name, description, gender, email, username }) => ({
          _id,
          name,
          description,
          gender,
          email,
          username,
        })
      );
      return res.status(200).json({
        error: false,
        message: "Get all available doctors successfully!",
        data: simplifiedDoctors,
      });
    }
    res.status(400).json({ error: true, message: "No doctors available!!" });
  } catch (error) {
    if (error.message.includes("Path"))
      res.status(409).json({
        error: true,
        message: "Invalid data!!",
      });
    else
      res.status(409).json({
        error: true,
        message: "Error!!",
      });
  }
};

module.exports = { getDoctors };
