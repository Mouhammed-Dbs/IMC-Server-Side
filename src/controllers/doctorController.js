const Doctor = require("../models/Doctor");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/ApiError");

const getDoctors = asyncHandler(async (req, res, next) => {
  try {
    const doctors = await Doctor.find();
    if (doctors.length > 0) {
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
    return next(new ApiError("No doctors available!", 404));
  } catch (error) {
    next(new ApiError("An error occurred while fetching doctors!", 500));
  }
});

module.exports = { getDoctors };
