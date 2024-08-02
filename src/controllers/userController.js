const User = require("../models/User");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/ApiError");

const getInfoUser = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError("User not found!", 404));
    }

    res.status(200).json({
      error: false,
      message: "Get user info successfully!",
      data: {
        user: {
          name: user.name,
          username: user.username,
          email: user.email,
          age: user.age,
          gender: user.gender,
        },
      },
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new ApiError("JWT is invalid!", 401));
    }
    if (error.message.includes("duplicate key")) {
      return next(new ApiError("User already exists!", 409));
    }
    if (error.message.includes("Path")) {
      return next(new ApiError("Invalid data!", 409));
    }
    next(new ApiError("An unexpected error occurred!", 500));
  }
});

module.exports = { getInfoUser };
