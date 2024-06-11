const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

registerUser = async (req, res) => {
  try {
    const { name, age, gender, email, username, password } = req.body;

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
      message: "User has registered successfully!!",
      token,
    });
  } catch (error) {
    if (error.message.includes("duplicate key"))
      res.status(409).json({
        error: true,
        message: "User already exist!!",
      });
    else if (error.message.includes("Path"))
      res.status(400).json({
        error: true,
        message: "Invalid data!!",
      });
    else
      res.status(400).json({
        error: true,
        message: error.message,
      });
  }
};

loginUser = async (req, res) => {
  try {
    const { email, password } = req.query;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res
        .status(401)
        .json({ error: true, message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    res.status(200).json({
      error: false,
      message: "User has logged in successfully!",
      token,
    });
  } catch (error) {
    if (error.message.includes("duplicate key"))
      res.status(409).json({
        error: true,
        message: "User already exist!!",
      });
    else if (error.message.includes("Path"))
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

module.exports = { registerUser, loginUser };
