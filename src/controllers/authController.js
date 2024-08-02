const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

const registerUser = asyncHandler(async (req, res, next) => {
  const { name, age, gender, email, username, password } = req.body;

  if (!name || !email || !password) {
    return next(new ApiError("Name, email, and password are required!", 400));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({
    name,
    age,
    gender,
    email,
    username,
    password: hashedPassword,
  });

  await newUser.save();
  const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET);

  res.status(201).json({
    error: false,
    message: "User has registered successfully!",
    token,
  });
});

const loginUser = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ApiError("Email and password are required!", 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return next(new ApiError("Invalid credentials", 401));
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

  res.status(200).json({
    error: false,
    message: "User has logged in successfully!",
    token,
  });
});

module.exports = { registerUser, loginUser };
